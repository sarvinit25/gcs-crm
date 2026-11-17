import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { scrub } from "./intake/intake.service";
import { askReply, caLegalIntent, handoffReply, hasEnoughDetail, looksLikeLoanTalk, type Category } from "./ca-legal";

const STAGE = "whatsapp-ca-legal";
const K_STATE = "ca-legal-request";
const K_SERVICE = "ca-legal-service";
const K_NEED = "ca-legal-need";

export type DeskReply = { reply: string; handoff: boolean };

/**
 * Handles a CA or legal enquiry on a customer's WhatsApp chat and keeps what was learnt on the lead, where staff see it with
 * the other answers: the request's state, the service asked about, and what the person needs (private numbers removed).
 */
@Injectable()
export class CaLegalDesk {
  constructor(private prisma: PrismaService) {}

  private async put(leadId: string, key: string, label: string, value: string) {
    await this.prisma.leadAnswer.upsert({
      where: { leadId_key: { leadId, key } },
      create: { leadId, stage: STAGE, key, label, value: value.slice(0, 500) },
      update: { stage: STAGE, label, value: value.slice(0, 500) },
    });
  }

  /** The reply to send, or null when this message is not for the CA & Legal desk and the normal assistant should take it. */
  async handle(leadId: string, rawText: string): Promise<DeskReply | null> {
    const text = scrub(rawText ?? "").trim();
    if (!text) return null;
    const state = (await this.prisma.leadAnswer.findUnique({ where: { leadId_key: { leadId, key: K_STATE } }, select: { value: true } }))?.value;
    const intent = caLegalIntent(text);

    // They were asked what they need, and this is the answer. Unless they have moved on to asking about a loan.
    if (state === "Asked") {
      if (!intent && looksLikeLoanTalk(text)) {
        await this.put(leadId, K_STATE, "CA & Legal request", "Dropped (asked about a loan instead)");
        return null;
      }
      const service = (await this.prisma.leadAnswer.findUnique({ where: { leadId_key: { leadId, key: K_SERVICE } }, select: { value: true } }))?.value;
      const had = (await this.prisma.leadAnswer.findUnique({ where: { leadId_key: { leadId, key: K_NEED } }, select: { value: true } }))?.value;
      await this.put(leadId, K_NEED, "What they need (CA & Legal)", [had, text].filter(Boolean).join(" | "));
      await this.put(leadId, K_STATE, "CA & Legal request", "Passed to team");
      return { reply: handoffReply(service ? (service.split(", ") as Category[]) : null), handoff: true };
    }

    if (!intent) return null;
    const { categories } = intent;
    await this.put(leadId, K_SERVICE, "CA & Legal service asked about", categories.join(", "));
    await this.put(leadId, K_NEED, "What they need (CA & Legal)", text);
    if (hasEnoughDetail(text)) {
      await this.put(leadId, K_STATE, "CA & Legal request", "Passed to team");
      return { reply: handoffReply(categories), handoff: true };
    }
    await this.put(leadId, K_STATE, "CA & Legal request", "Asked");
    return { reply: askReply(categories), handoff: false };
  }
}
