import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ApplicationStatus, LeadStatus, NotificationTrigger, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { formatDateIST, formatIndianNumber, istDayEnd, istDayStart, istParts, ymd } from "../common/date.util";
import { NotificationEngine } from "./notification-engine.service";

const DAY_MS = 24 * 60 * 60 * 1000;
/** If the server was down at the brief time, it still goes out for this long afterwards. */
const GRACE_MS = 3 * 60 * 60 * 1000;
const CLOSED = [ApplicationStatus.DISBURSED, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN];
const OPEN_LEAD = { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] };

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** The morning and evening summaries sent to the admin's phone. */
@Injectable()
export class BriefsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("Briefs");
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private engine: NotificationEngine,
  ) {}

  onModuleInit() {
    // Tests drive tick() themselves with a clock they control.
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.tick().catch((e: Error) => this.log.error(e.message)), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Who gets a brief: the numbers listed in setup, or every active admin who has a phone. */
  private async recipients() {
    const listed = this.settings.get<string[]>("whatsapp.briefRecipients").map((p) => p.trim()).filter(Boolean);
    if (listed.length) return listed.map((phone) => ({ phone, name: null as string | null }));
    const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN, active: true, phone: { not: null } }, select: { name: true, phone: true } });
    return admins.map((a) => ({ phone: a.phone, name: a.name }));
  }

  private async values(kind: "morning" | "evening", now: Date): Promise<Record<string, string>> {
    const p = istParts(now);
    const start = istDayStart(p);
    const end = istDayEnd(p);
    const company = this.settings.get<string>("org.name") || "Growth Capital Services";
    const date = formatDateIST(now);

    if (kind === "morning") {
      const [activeFiles, followUpsDue, newLeadsYesterday] = await Promise.all([
        this.prisma.application.count({ where: { archivedAt: null, status: { notIn: CLOSED } } }),
        this.prisma.lead.count({ where: { archivedAt: null, status: OPEN_LEAD, nextFollowUpAt: { lte: end } } }),
        this.prisma.lead.count({ where: { createdAt: { gte: new Date(start.getTime() - DAY_MS), lt: start } } }),
      ]);
      return { date, activeFiles: String(activeFiles), followUpsDue: String(followUpsDue), newLeadsYesterday: String(newLeadsYesterday), company };
    }

    const [newLeadsToday, sanctionedToday, payouts, followUpsPending] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: { gte: start, lte: end } } }),
      this.prisma.sanction.count({ where: { financialStatus: "APPROVED", updatedAt: { gte: start, lte: end } } }),
      this.prisma.disbursement.aggregate({ where: { disbursedAt: { gte: start, lte: end } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.lead.count({ where: { archivedAt: null, status: OPEN_LEAD, nextFollowUpAt: { lte: now } } }),
    ]);
    return {
      date,
      newLeadsToday: String(newLeadsToday),
      sanctionedToday: String(sanctionedToday),
      disbursedToday: String(payouts._count._all),
      disbursedAmountToday: `₹${formatIndianNumber(Math.round(Number(payouts._sum.amount ?? 0)))}`,
      followUpsPending: String(followUpsPending),
      company,
    };
  }

  private async send(kind: "morning" | "evening", now: Date, dayKey?: string) {
    const trigger: NotificationTrigger = kind === "morning" ? "MORNING_BRIEF" : "EVENING_BRIEF";
    await this.engine.dispatch({
      trigger,
      values: await this.values(kind, now),
      staff: await this.recipients(),
      entityType: "Brief",
      dayKey,
    });
  }

  /** The "send now" button: for checking the wording and the connection, whatever the time. */
  async sendNow(kind: "morning" | "evening") {
    await this.send(kind, new Date());
    return { ok: true };
  }

  /** Called every minute. Sends each brief once a day, at or shortly after its time. */
  async tick(now: Date = new Date()) {
    if (!this.settings.get<boolean>("whatsapp.briefsEnabled")) return;
    const p = istParts(now);
    const minutesNow = (now.getTime() - istDayStart(p).getTime()) / 60_000;
    const dayKey = ymd(p);

    for (const [kind, key] of [["morning", "whatsapp.morningBriefTime"], ["evening", "whatsapp.eveningBriefTime"]] as const) {
      const at = minutesOf(this.settings.get<string>(key));
      if (minutesNow < at || minutesNow >= at + GRACE_MS / 60_000) continue;
      const trigger: NotificationTrigger = kind === "morning" ? "MORNING_BRIEF" : "EVENING_BRIEF";
      // Already tried today — sent or skipped — so a restart or a second tick doesn't repeat it.
      const done = await this.prisma.notificationLog.findFirst({ where: { trigger, dayKey }, select: { id: true } });
      if (!done) await this.send(kind, now, dayKey);
    }
  }
}
