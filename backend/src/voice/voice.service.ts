import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LeadsService } from "../leads/leads.service";
import { readCall, type CallDetails } from "./voice-payload";

export const VOICE_SOURCE = "ai-telecaller";

export type VoiceOutcome = "LEAD_CREATED" | "LEAD_UPDATED" | "NO_LEAD" | "ERROR" | "DUPLICATE";

/** What the lead's notes say about the call: the agent's own summary first, then what it picked up. */
export function callNote(c: CallDetails, when = new Date()): string {
  const lines = [`AI phone call, ${when.toISOString().slice(0, 16).replace("T", " ")} UTC${c.durationSec ? `, ${c.durationSec}s` : ""}.`];
  if (c.summary) lines.push(c.summary);
  if (c.loanType) lines.push(`Loan type: ${c.loanType}`);
  if (c.amount) lines.push(`Amount: ${c.amount}`);
  return lines.join("\n").slice(0, 2000);
}

/**
 * Takes the voice agent's end-of-call message, keeps it as received, and turns a connected call from a real
 * mobile number into a lead (or adds to the one that number already has).
 */
@Injectable()
export class VoiceService {
  private readonly log = new Logger("VoiceCalls");

  constructor(
    private prisma: PrismaService,
    private leads: LeadsService,
  ) {}

  async accept(payload: unknown): Promise<{ outcome: VoiceOutcome; leadId?: string }> {
    const call = readCall(payload);

    if (call.callId && (await this.prisma.voiceCall.findUnique({ where: { callId: call.callId }, select: { id: true } }))) {
      return { outcome: "DUPLICATE" };
    }

    let outcome: VoiceOutcome = "NO_LEAD";
    let leadId: string | undefined;
    let error: string | undefined;

    if (call.connected && call.phone) {
      try {
        const lead = await this.leads.intake({
          name: call.name && call.name.length >= 2 ? call.name : "Phone enquiry",
          phone: call.phone,
          city: call.city && call.city.length >= 2 ? call.city : undefined,
          amount: call.amount ?? undefined,
          source: VOICE_SOURCE,
          detail: callNote(call),
        } as never);
        leadId = lead.id;
        outcome = "isNew" in lead && lead.isNew ? "LEAD_CREATED" : "LEAD_UPDATED";
      } catch (err) {
        outcome = "ERROR";
        error = (err as Error).message.slice(0, 500);
        this.log.error(`Could not turn a call into a lead: ${error}`);
      }
    }

    try {
      await this.prisma.voiceCall.create({
        data: {
          callId: call.callId,
          phone: call.phone,
          status: call.status,
          durationSec: call.durationSec,
          outcome,
          leadId,
          error,
          summary: call.summary,
          transcript: call.transcript,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // The same call delivered twice at once: the other copy won.
      if ((err as { code?: string }).code === "P2002") return { outcome: "DUPLICATE", leadId };
      throw err;
    }
    return { outcome, leadId };
  }
}
