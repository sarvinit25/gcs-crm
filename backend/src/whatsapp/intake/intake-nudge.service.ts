import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WhatsAppDirection, WhatsAppSender } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import { ConversationsService } from "../conversations.service";
import { toWaId } from "../phone";
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from "../whatsapp.provider";
import { answerKey } from "./intake.engine";
import { IntakeService } from "./intake.service";

const HOUR = 60 * 60 * 1000;
/** Quiet for at least this long before a reminder; and always inside WhatsApp's 24-hour free-message window, with room to spare. */
const QUIET_FOR = 3 * HOUR;
const WINDOW = 20 * HOUR;
const MARKER = "Reminder sent on WhatsApp";

/**
 * One gentle reminder to a customer who went quiet part way through the questions. Off unless switched on in Settings.
 * It sends at most once per customer, only between 9 am and 8 pm India time, only inside WhatsApp's free-message window,
 * never to someone a person has taken over, and never to someone who said "not now" or "the rest on the call".
 */
@Injectable()
export class IntakeNudgeService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("WhatsAppNudge");
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private conversations: ConversationsService,
    private intake: IntakeService,
    @Inject(WHATSAPP_PROVIDER) private provider: WhatsAppProvider,
  ) {}

  onModuleInit() {
    // Tests drive tick() themselves with a clock they control.
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.tick().catch((e: Error) => this.log.error(e.message)), 15 * 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends the reminders that are due. Returns how many went out. */
  async tick(now: Date = new Date()): Promise<number> {
    if (!this.settings.get<boolean>("whatsapp.aiIntake") || !this.settings.get<boolean>("whatsapp.nudgeUnfinished")) return 0;
    const hour = new Date(now.getTime() + 330 * 60_000).getUTCHours(); // India time
    if (hour < 9 || hour >= 20) return 0;

    const quiet = await this.prisma.whatsAppConversation.findMany({
      where: { needsHuman: false, leadId: { not: null }, lastInboundAt: { gte: new Date(now.getTime() - WINDOW), lte: new Date(now.getTime() - QUIET_FOR) } },
      select: { id: true, phone: true, leadId: true, lastInboundAt: true },
      orderBy: { lastInboundAt: "asc" },
      take: 25,
    });
    let sent = 0;
    for (const c of quiet) {
      try {
        // we spoke last (asked something) and they never answered
        const last = await this.prisma.whatsAppMessage.findFirst({ where: { conversationId: c.id }, orderBy: { createdAt: "desc" }, select: { direction: true } });
        if (last?.direction !== WhatsAppDirection.OUT) continue;
        const key = answerKey(MARKER);
        const already = await this.prisma.leadAnswer.findUnique({ where: { leadId_key: { leadId: c.leadId!, key } }, select: { id: true } });
        if (already) continue;
        const state = await this.intake.isUnfinished(c.leadId!);
        if (!state.unfinished) continue;
        const loan = state.loan ? ` ${state.loan}` : "";
        const text = `Hello${state.name ? ` ${state.name}` : ""}, we were part way through your${loan} enquiry with Growth Capital Services. Reply "continue" whenever it suits you and Ria will pick up where we stopped.`;
        const result = await this.provider.sendText(toWaId(c.phone), text);
        if (!result) continue;
        await this.conversations.recordOutbound({ conversationId: c.id, sender: WhatsAppSender.BOT, type: "text", body: text, waMessageId: result.waMessageId });
        await this.prisma.leadAnswer.create({ data: { leadId: c.leadId!, stage: "whatsapp", key, label: MARKER, value: `Sent ${now.toISOString().slice(0, 16).replace("T", " ")} UTC` } });
        sent += 1;
      } catch (error) {
        this.log.warn(`Could not send a reminder: ${(error as Error).message.slice(0, 200)}`);
      }
    }
    return sent;
  }
}
