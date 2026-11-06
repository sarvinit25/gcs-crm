import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { Role, WhatsAppContactKind, WhatsAppMessageStatus, WhatsAppSender } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { LeadsService } from "../leads/leads.service";
import { AssistantService, type ChatMessage as ChatTurn } from "../assistant/assistant.service";
import { ConversationsService } from "./conversations.service";
import { IntakeService } from "./intake/intake.service";
import { MediaService } from "./media.service";
import { WHATSAPP_PROVIDER, type Interactive, type WhatsAppProvider } from "./whatsapp.provider";
import { contactKey, toWaId } from "./phone";
import { STAGE_LABEL } from "./templates.util";

type Incoming = {
  id: string;
  from: string;
  type: string;
  /** The id of the button or list row the customer tapped, when they tapped rather than typed. */
  replyId?: string;
  /** WhatsApp's id for a file the customer sent, with the name and caption they gave it. */
  mediaId?: string;
  fileName?: string;
  caption?: string;
  body: string | null;
  name: string | null;
  at: Date;
};

const env = (key: string) => process.env[key]?.trim() || "";
const MAX_REPLY = 3500;
const MAX_TURNS = 12;

const STATUS_MAP: Record<string, WhatsAppMessageStatus> = {
  sent: WhatsAppMessageStatus.SENT,
  delivered: WhatsAppMessageStatus.DELIVERED,
  read: WhatsAppMessageStatus.READ,
  failed: WhatsAppMessageStatus.FAILED,
};

/**
 * Everything that arrives from Meta: the handshake, the signature check, and
 * what to do with each message. Customers get the chatbot or a person; staff
 * get the CRM assistant, limited to what their own login could see.
 */
@Injectable()
export class InboundService {
  private readonly log = new Logger("WhatsAppInbound");
  /** Meta wants a quick 200, so messages are handled after the reply. Tests wait on this. */
  private pending = new Set<Promise<void>>();
  /** A team member's running chat with the assistant, forgotten after the idle timeout. */
  private memory = new Map<string, { turns: ChatTurn[]; at: number }>();

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private conversations: ConversationsService,
    private leads: LeadsService,
    private assistant: AssistantService,
    private intake: IntakeService,
    private media: MediaService,
    @Inject(WHATSAPP_PROVIDER) private provider: WhatsAppProvider,
  ) {}

  idle() {
    return Promise.all([...this.pending]).then(() => undefined);
  }

  /** Meta's one-time check when the webhook address is saved. Returns the challenge, or null to refuse. */
  handshake(mode?: string, token?: string, challenge?: string) {
    const expected = env("WHATSAPP_VERIFY_TOKEN");
    if (mode !== "subscribe" || !expected || !token) return null;
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b) ? (challenge ?? "") : null;
  }

  /** Meta signs every call with the app secret. Without a secret on the server nothing is accepted. */
  validSignature(raw: Buffer | undefined, header: string | undefined) {
    const secret = env("WHATSAPP_APP_SECRET");
    if (!secret || !raw || !header?.startsWith("sha256=")) return false;
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const given = header.slice(7);
    return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  }

  accept(payload: unknown) {
    const work = this.process(payload)
      .catch((err: Error) => this.log.error(`Could not handle a WhatsApp call: ${err.message}`))
      .finally(() => this.pending.delete(work));
    this.pending.add(work);
  }

  private async process(payload: unknown) {
    const entries = ((payload as { entry?: unknown[] } | null)?.entry ?? []) as {
      changes?: { value?: Record<string, unknown> }[];
    }[];
    for (const change of entries.flatMap((e) => e.changes ?? [])) {
      const value = change.value ?? {};
      const metadata = value.metadata as { phone_number_id?: string } | undefined;
      const ours = env("WHATSAPP_PHONE_NUMBER_ID");
      // A call about a different number (another app on the same webhook) is not ours to answer.
      if (ours && metadata?.phone_number_id && metadata.phone_number_id !== ours) {
        this.log.warn("Ignored a call for a different WhatsApp number id");
        continue;
      }

      for (const status of (value.statuses as { id?: string; status?: string; errors?: { title?: string; message?: string }[] }[] | undefined) ?? []) {
        const mapped = status.id && status.status ? STATUS_MAP[status.status] : undefined;
        if (mapped && status.id) await this.conversations.recordStatus(status.id, mapped, status.errors?.[0]?.title ?? status.errors?.[0]?.message);
      }

      const names = new Map<string, string>(
        ((value.contacts as { wa_id?: string; profile?: { name?: string } }[] | undefined) ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? ""]),
      );
      type Tap = { id?: string; title?: string };
      type Media = { id?: string; filename?: string; caption?: string };
      for (const m of (value.messages as { id?: string; from?: string; type?: string; timestamp?: string; text?: { body?: string }; interactive?: { button_reply?: Tap; list_reply?: Tap }; document?: Media; image?: Media }[] | undefined) ?? []) {
        if (!m.id || !m.from) continue;
        const tap = m.type === "interactive" ? (m.interactive?.button_reply ?? m.interactive?.list_reply) : undefined;
        const media = m.type === "document" ? m.document : m.type === "image" ? m.image : undefined;
        await this.handleMessage({
          id: m.id,
          from: m.from,
          type: m.type ?? "unknown",
          ...(tap?.id ? { replyId: tap.id } : {}),
          ...(media?.id ? { mediaId: media.id, fileName: media.filename, caption: media.caption } : {}),
          body: m.type === "text" ? (m.text?.body ?? "") : tap ? (tap.title ?? "") : media ? (media.caption || `📎 ${media.filename ?? (m.type === "image" ? "Photo" : "File")}`) : null,
          name: names.get(m.from) || null,
          at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
        });
      }
    }
  }

  private async say(phone: string, text: string) {
    try {
      return await this.provider.sendText(toWaId(phone), text.slice(0, MAX_REPLY));
    } catch (err) {
      this.log.error(`Could not reply on WhatsApp: ${(err as Error).message}`);
      return null;
    }
  }

  /** Sends a tap-to-choose message; if WhatsApp refuses it, sends the same question as plain text with the choices listed. */
  private async sayOptions(phone: string, content: Interactive) {
    try {
      return await this.provider.sendInteractive(toWaId(phone), content);
    } catch (err) {
      this.log.warn(`Could not send a tap-to-choose message, sending text instead: ${(err as Error).message}`);
      const choices = content.kind === "buttons" ? content.buttons.map((b) => b.title) : content.rows.map((r) => r.title);
      return this.say(phone, `${content.body}\n\n${choices.map((c) => `- ${c}`).join("\n")}`);
    }
  }

  private async findEmployee(phone: string) {
    const staff = await this.prisma.user.findMany({
      where: { active: true, phone: { not: null } },
      select: { id: true, name: true, email: true, role: true, phone: true },
    });
    return staff.find((u) => contactKey(u.phone) === phone) ?? null;
  }

  private async handleMessage(m: Incoming) {
    const phone = contactKey(m.from);
    if (!phone) return;

    const employee = await this.findEmployee(phone);
    if (employee) return this.handleEmployee(employee, phone, m);
    return this.handleCustomer(phone, m);
  }

  // ── Team members ────────────────────────────────────────────

  private async handleEmployee(user: { id: string; name: string; email: string; role: Role }, phone: string, m: Incoming) {
    if (!this.settings.get<boolean>("whatsapp.chatbotEnabled")) return;
    const text = m.body?.trim();
    if (m.type !== "text" || !text) {
      await this.say(phone, "I can only read text messages. Send your question as text, or reply *help*.");
      return;
    }

    const lower = text.toLowerCase();
    if (["help", "menu", "commands", "?"].includes(lower)) {
      await this.say(
        phone,
        [
          "I'm the GCS CRM assistant. Ask me anything about your files and leads in plain English or Hinglish, for example:",
          "- How many active files?",
          "- Aaj kitne follow-ups due hain?",
          "- Status of GCS-2026-0042",
          "",
          "*reset* or *clear* — start a fresh conversation",
          "*cancel* or *exit* — stop the current question",
          "*help* — show this list",
          "I only show what your own login can see.",
        ].join("\n"),
      );
      return;
    }
    if (["reset", "clear", "cancel", "exit", "new"].includes(lower)) {
      this.memory.delete(user.id);
      await this.say(phone, "Done — we're starting fresh. What would you like to know?");
      return;
    }

    const timeoutMs = this.settings.get<number>("whatsapp.sessionTimeoutMinutes") * 60_000;
    const kept = this.memory.get(user.id);
    const turns = kept && Date.now() - kept.at < timeoutMs ? kept.turns : [];
    turns.push({ role: "user", content: text.slice(0, 2000) });

    try {
      const { reply, raw } = await this.assistant.ask(turns.slice(-MAX_TURNS), { id: user.id, name: user.name, email: user.email, role: user.role });
      // The person gets `reply`; what is remembered for the next question is `raw`, which still holds the
      // placeholders — revealed identity details must never be sent back to the AI provider.
      turns.push({ role: "assistant", content: raw });
      this.memory.set(user.id, { turns: turns.slice(-MAX_TURNS), at: Date.now() });
      await this.say(phone, reply);
    } catch (err) {
      // "Not set up", "daily limit" and the like are written for people, so they are passed on as they are.
      const message = err instanceof HttpException ? String((err.getResponse() as { message?: string }).message ?? err.message) : "Something went wrong. Please try again.";
      await this.say(phone, message);
    }
  }

  // ── Customers ───────────────────────────────────────────────

  private async handleCustomer(phone: string, m: Incoming) {
    const recorded = await this.conversations.recordInbound({
      phone,
      name: m.name,
      waMessageId: m.id,
      type: m.type,
      body: m.body,
      at: m.at,
    });
    if (!recorded) return; // Meta delivered it twice
    let conversation = recorded.conversation;

    // Someone new writing in is an enquiry: it becomes a lead, so it is followed up like any other.
    if (!conversation.leadId && !conversation.applicationId && /^[6-9]\d{9}$/.test(phone)) {
      const lead = await this.leads.intake({ name: m.name && m.name.trim().length >= 2 ? m.name.trim() : "WhatsApp enquiry", phone, source: "whatsapp" } as never);
      conversation = await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { leadId: lead.id, kind: WhatsAppContactKind.CUSTOMER },
      });
    }

    if (!this.settings.get<boolean>("whatsapp.chatbotEnabled") || conversation.needsHuman) return;

    const text = (m.body ?? "").trim().toLowerCase();
    const company = this.settings.get<string>("org.name") || "Growth Capital Services";
    let reply: string | null = null;
    let flag = false;

    // Gia, when switched on, takes the conversation: she asks the website's questions and saves the answers on the lead.
    // "status" and a request for a person still work as before. If she cannot answer, the lines below take over.
    const wantsPerson = /^(agent|human|person|callback|call me|talk to)\b/.test(text);
    const typedOrTapped = m.type === "text" || (m.type === "interactive" && Boolean(m.replyId));
    // A file, photo or voice note: Gia says kindly she cannot open it and carries on, instead of going quiet.
    if (["document", "image", "video", "audio", "sticker"].includes(m.type) && !wantsPerson && this.intake.enabled()) {
      void this.provider.showTyping(m.id);
      // Documents and photos are kept on the lead; voice notes and videos still cannot be opened.
      let kind = m.type;
      if (m.mediaId && conversation.leadId) {
        const result = await this.media.save({ leadId: conversation.leadId, mediaId: m.mediaId, fileName: m.fileName, caption: m.caption });
        kind = result.saved ? "saved" : `not_saved_${result.reason}`;
      }
      const ai = await this.intake.reply({ id: conversation.id, leadId: conversation.leadId, name: conversation.name }, undefined, kind);
      if (ai.text) {
        const sent = ai.options ? await this.sayOptions(phone, ai.options) : await this.say(phone, ai.text);
        if (sent) {
          const offered = ai.options ? (ai.options.kind === "buttons" ? ai.options.buttons.map((b) => b.title) : ai.options.rows.map((r) => r.title)) : [];
          const body = offered.length ? `${ai.text}\n\n${offered.map((t) => `▫ ${t}`).join("\n")}` : ai.text;
          await this.conversations.recordOutbound({ conversationId: conversation.id, sender: WhatsAppSender.BOT, type: "text", body, waMessageId: sent.waMessageId });
        }
        return;
      }
    }
    if (typedOrTapped && text !== "status" && !wantsPerson && this.intake.enabled()) {
      // blue ticks and "typing..." while the answer is being written, so it feels like a person
      void this.provider.showTyping(m.id);
      const ai = await this.intake.reply({ id: conversation.id, leadId: conversation.leadId, name: conversation.name }, m.replyId);
      if (ai.silent) return;
      if (ai.text) {
        if (ai.handoff) await this.prisma.whatsAppConversation.update({ where: { id: conversation.id }, data: { needsHuman: true } });
        const sent = ai.options ? await this.sayOptions(phone, ai.options) : await this.say(phone, ai.text);
        if (sent) {
          // staff see the choices that were offered under the message
          const offered = ai.options ? (ai.options.kind === "buttons" ? ai.options.buttons.map((b) => b.title) : ai.options.rows.map((r) => r.title)) : [];
          const body = offered.length ? `${ai.text}\n\n${offered.map((t) => `▫ ${t}`).join("\n")}` : ai.text;
          await this.conversations.recordOutbound({ conversationId: conversation.id, sender: WhatsAppSender.BOT, type: "text", body, waMessageId: sent.waMessageId });
        }
        return;
      }
    }

    if (m.type !== "text") {
      reply = "Thank you — we've received it. A team member will look at it and reply here shortly.";
      flag = true;
    } else if (/^(hi+|hello+|hey+|hlo|namaste|namaskar|good (morning|afternoon|evening))\b/.test(text)) {
      reply = `Hello${conversation.name ? ` ${conversation.name.split(" ")[0]}` : ""}! Welcome to ${company}. You can type:\n- *status* — to see where your loan file stands\n- *agent* — to talk to a team member\n- *help* — to see this list again`;
    } else if (["help", "menu", "commands"].includes(text)) {
      reply = "You can type:\n- *status* — where your loan file stands\n- *agent* — talk to a team member\n- anything else, and a team member will reply";
    } else if (text === "status") {
      reply = await this.statusFor(phone);
    } else if (/^(agent|human|person|callback|call me|talk to)\b/.test(text)) {
      reply = "Of course — a team member will message you here shortly.";
      flag = true;
    } else {
      // The bot answers the commands above; anything else is for a person. It says so once, not on every message.
      const timeoutMs = this.settings.get<number>("whatsapp.sessionTimeoutMinutes") * 60_000;
      const recentBot = await this.prisma.whatsAppMessage.findFirst({
        where: { conversationId: conversation.id, sender: WhatsAppSender.BOT, createdAt: { gte: new Date(Date.now() - timeoutMs) } },
        select: { id: true },
      });
      if (!recentBot) reply = "Thanks for your message. A team member will reply here shortly. Meanwhile, type *status* to check your loan file.";
      flag = true;
    }

    if (flag) await this.prisma.whatsAppConversation.update({ where: { id: conversation.id }, data: { needsHuman: true } });
    if (reply) {
      const sent = await this.say(phone, reply);
      if (sent) {
        await this.conversations.recordOutbound({ conversationId: conversation.id, sender: WhatsAppSender.BOT, type: "text", body: reply, waMessageId: sent.waMessageId });
      }
    }
  }

  /** Where this number's files stand. Only the stage is shared — nothing about amounts or other people. */
  private async statusFor(phone: string) {
    const applicants = await this.prisma.applicant.findMany({
      where: { phone, application: { archivedAt: null } },
      orderBy: { application: { createdAt: "desc" } },
      take: 3,
      select: { application: { select: { seq: true, createdAt: true, status: true, loanProduct: { select: { name: true } } } } },
    });
    if (applicants.length) {
      const lines = applicants.map(
        (a) => `- ${this.settings.applicationNo(a.application.seq, a.application.createdAt)} (${a.application.loanProduct.name}): ${STAGE_LABEL[a.application.status] ?? a.application.status}`,
      );
      return `Here is where your file stands:\n${lines.join("\n")}`;
    }
    const lead = await this.prisma.lead.findFirst({ where: { phone, archivedAt: null }, select: { id: true } });
    return lead
      ? "We have your enquiry and a team member will contact you soon. Type *agent* if you'd like us to message you now."
      : "I couldn't find a file for this number. Type *agent* and a team member will help.";
  }
}
