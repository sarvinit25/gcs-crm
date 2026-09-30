import { Injectable } from "@nestjs/common";
import { ApplicationStatus, LeadStatus, PayoutStatus, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { istDayEnd, istDayStart, istParts } from "../common/date.util";
import type { AuthUser } from "../auth/auth.decorators";

export type Severity = "high" | "medium" | "info";

export type Notification = {
  id: string;
  kind: "followup" | "stalled" | "sanction" | "login" | "unassigned" | "commission";
  severity: Severity;
  title: string;
  detail: string;
  path: string;
  hash?: string;
  /** When it became due — lets the list sort oldest-first within a severity. */
  since?: string;
};

const DAY = 86_400_000;
const PER_KIND = 8;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ORDER: Record<Severity, number> = { high: 0, medium: 1, info: 2 };

/**
 * Reminders are worked out from live data rather than stored, so there is
 * nothing to mark as read and an item disappears the moment the underlying
 * problem is fixed. Staff see only their own files; managers see everything.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async list(user: AuthUser) {
    const now = new Date();
    const today = istParts(now);
    const startToday = istDayStart(today);
    const endToday = istDayEnd(today);
    const staff = user.role === Role.ADVISOR;
    const leadScope: Prisma.LeadWhereInput = staff ? { assignedOfficerId: user.id } : {};
    const appScope: Prisma.ApplicationWhereInput = staff ? { ownerId: user.id } : {};

    const stalledDays = this.settings.get<number>("pipeline.stalledAfterDays");
    const warnDays = this.settings.get<number>("pipeline.sanctionExpiryWarnDays");
    const loginDays = this.settings.get<number>("pipeline.loginPendingDays");
    const appNo = (a: { seq: number; createdAt: Date }) => this.settings.applicationNo(a.seq, a.createdAt);
    const person = (a: { applicants: { name: string }[] }) => a.applicants[0]?.name ?? "No applicant yet";
    const primary = { applicants: { where: { isPrimary: true }, take: 1, select: { name: true } } } as const;

    const [due, stalled, expiring, login, unassigned, unpaid] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          ...leadScope,
          status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] },
          nextFollowUpAt: { lte: endToday },
        },
        orderBy: { nextFollowUpAt: "asc" },
        take: PER_KIND,
        select: { id: true, leadNo: true, name: true, phone: true, nextFollowUpAt: true },
      }),
      this.prisma.application.findMany({
        where: {
          ...appScope,
          status: { in: [ApplicationStatus.SUBMITTED, ApplicationStatus.BANK_LOGIN, ApplicationStatus.UNDER_REVIEW] },
          updatedAt: { lt: new Date(now.getTime() - stalledDays * DAY) },
        },
        orderBy: { updatedAt: "asc" },
        take: PER_KIND,
        select: { id: true, seq: true, createdAt: true, status: true, updatedAt: true, ...primary },
      }),
      this.prisma.sanction.findMany({
        where: {
          application: { ...appScope, status: ApplicationStatus.SANCTIONED },
          validTill: { gte: startToday, lte: new Date(endToday.getTime() + warnDays * DAY) },
        },
        orderBy: { validTill: "asc" },
        take: PER_KIND,
        select: { validTill: true, application: { select: { id: true, seq: true, createdAt: true, ...primary } } },
      }),
      this.prisma.application.findMany({
        where: {
          ...appScope,
          status: ApplicationStatus.SUBMITTED,
          bankLoginAt: null,
          createdAt: { lt: new Date(now.getTime() - loginDays * DAY) },
        },
        orderBy: { createdAt: "asc" },
        take: PER_KIND,
        select: { id: true, seq: true, createdAt: true, ...primary },
      }),
      staff
        ? []
        : this.prisma.lead.findMany({
            where: { assignedOfficerId: null, status: LeadStatus.NEW },
            orderBy: { createdAt: "asc" },
            take: PER_KIND,
            select: { id: true, leadNo: true, name: true, createdAt: true },
          }),
      staff
        ? []
        : this.prisma.commission.findMany({
            where: {
              status: PayoutStatus.PENDING,
              disbursement: { disbursedAt: { lt: new Date(now.getTime() - 30 * DAY) } },
            },
            orderBy: { disbursement: { disbursedAt: "asc" } },
            take: PER_KIND,
            select: {
              grossAmount: true,
              disbursement: {
                select: { disbursedAt: true, application: { select: { id: true, seq: true, createdAt: true, ...primary } } },
              },
            },
          }),
    ]);

    const daysAgo = (d: Date) => Math.floor((startToday.getTime() - istDayStart(istParts(d)).getTime()) / DAY);
    const items: Notification[] = [];

    for (const l of due) {
      const late = daysAgo(l.nextFollowUpAt!);
      items.push({
        id: `followup-${l.id}`,
        kind: "followup",
        severity: late > 0 ? "high" : "medium",
        title: `Follow up with ${l.name}`,
        detail: late > 0 ? `${plural(late, "day")} overdue · ${l.phone}` : `Due today · ${l.phone}`,
        path: `/leads/${l.id}`,
        hash: "followups",
        since: l.nextFollowUpAt!.toISOString(),
      });
    }
    for (const a of stalled) {
      items.push({
        id: `stalled-${a.id}`,
        kind: "stalled",
        severity: "medium",
        title: `${appNo(a)} has gone quiet`,
        detail: `${person(a)} · untouched for ${plural(daysAgo(a.updatedAt), "day")}`,
        path: `/applications/${a.id}`,
        since: a.updatedAt.toISOString(),
      });
    }
    for (const s of expiring) {
      const left = -daysAgo(s.validTill!);
      const a = s.application;
      items.push({
        id: `sanction-${a.id}`,
        kind: "sanction",
        severity: left <= 7 ? "high" : "medium",
        title: `${appNo(a)} sanction expires ${left <= 0 ? "today" : `in ${plural(left, "day")}`}`,
        detail: `${person(a)} · disburse before it lapses`,
        path: `/applications/${a.id}`,
        hash: "sanction",
        since: s.validTill!.toISOString(),
      });
    }
    for (const a of login) {
      items.push({
        id: `login-${a.id}`,
        kind: "login",
        severity: "medium",
        title: `${appNo(a)} is not logged in with a bank yet`,
        detail: `${person(a)} · submitted ${plural(daysAgo(a.createdAt), "day")} ago`,
        path: `/applications/${a.id}`,
        hash: "login",
        since: a.createdAt.toISOString(),
      });
    }
    for (const l of unassigned) {
      items.push({
        id: `unassigned-${l.id}`,
        kind: "unassigned",
        severity: "info",
        title: `${l.name} has no owner`,
        detail: `New lead #${l.leadNo} waiting ${plural(daysAgo(l.createdAt), "day")} for assignment`,
        path: `/leads/${l.id}`,
        since: l.createdAt.toISOString(),
      });
    }
    for (const c of unpaid) {
      const a = c.disbursement.application;
      items.push({
        id: `commission-${a.id}`,
        kind: "commission",
        severity: "info",
        title: `Commission on ${appNo(a)} not received`,
        detail: `${person(a)} · disbursed ${plural(daysAgo(c.disbursement.disbursedAt), "day")} ago`,
        path: "/commissions",
        since: c.disbursement.disbursedAt.toISOString(),
      });
    }

    items.sort((x, y) => ORDER[x.severity] - ORDER[y.severity] || (x.since ?? "").localeCompare(y.since ?? ""));
    return {
      count: items.length,
      urgent: items.filter((i) => i.severity === "high").length,
      items,
    };
  }
}
