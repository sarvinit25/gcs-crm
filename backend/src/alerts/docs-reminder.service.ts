import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { LeadStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EventsService } from "../events/events.service";
import { slug as answerKey } from "../leads/lead-answers";

const DAY = 24 * 60 * 60 * 1000;
/** A lead left "Docs pending" with nothing changing for this long is stalled. */
const STALLED_AFTER = 3 * DAY;
/** And it is reminded about at most this often. */
const REMIND_EVERY = 3 * DAY;
const MARKER = "Documents reminder sent";
const CUSTOMER_MARKER = "Customer documents reminder sent";

/**
 * Nudges the team about a lead that has been waiting for documents with nobody touching it. It goes out as the usual
 * "Follow-up needed" email (with the document checklist link), to the shared mailbox and the lead's owner, between 10 am and
 * 7 pm India time. The switch is the same as for the other follow-up emails (Settings -> Alerts).
 */
@Injectable()
export class DocsReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("DocsReminder");
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  onModuleInit() {
    // Tests drive tick() themselves with a clock they control.
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.tick().catch((e: Error) => this.log.error(e.message)), 60 * 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends the reminders that are due. Returns how many went out. */
  async tick(now: Date = new Date()): Promise<number> {
    const hour = new Date(now.getTime() + 330 * 60_000).getUTCHours(); // India time
    if (hour < 10 || hour >= 19) return 0;
    const stalled = await this.prisma.lead.findMany({
      where: { status: LeadStatus.DOCS_PENDING, archivedAt: null, updatedAt: { lte: new Date(now.getTime() - STALLED_AFTER) } },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 30,
    });
    let sent = 0;
    for (const lead of stalled) {
      try {
        const key = answerKey(MARKER);
        const last = await this.prisma.leadAnswer.findUnique({ where: { leadId_key: { leadId: lead.id, key } }, select: { value: true } });
        const lastAt = last ? Date.parse(last.value) : NaN;
        if (Number.isFinite(lastAt) && now.getTime() - lastAt < REMIND_EVERY) continue;
        const days = Math.floor((now.getTime() - lead.updatedAt.getTime()) / DAY);
        this.events.emit("FOLLOW_UP_NEEDED", { leadId: lead.id, why: "documents-pending", note: `Waiting for documents; nothing has changed for ${days} days.` });
        // The customer is reminded once only (if the template is set up and approved); the team is reminded every few days.
        const cKey = answerKey(CUSTOMER_MARKER);
        const told = await this.prisma.leadAnswer.findUnique({ where: { leadId_key: { leadId: lead.id, key: cKey } }, select: { id: true } });
        if (!told) {
          this.events.emit("DOCS_STALLED", { leadId: lead.id });
          await this.prisma.leadAnswer.create({ data: { leadId: lead.id, stage: "system", key: cKey, label: CUSTOMER_MARKER, value: now.toISOString() } });
        }
        await this.prisma.leadAnswer.upsert({
          where: { leadId_key: { leadId: lead.id, key } },
          create: { leadId: lead.id, stage: "system", key, label: MARKER, value: now.toISOString() },
          update: { value: now.toISOString() },
        });
        sent += 1;
      } catch (error) {
        this.log.warn(`Could not remind about documents: ${(error as Error).message.slice(0, 200)}`);
      }
    }
    return sent;
  }
}
