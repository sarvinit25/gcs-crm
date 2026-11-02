import { Injectable } from "@nestjs/common";
import { ApplicationStatus, LeadStatus, PayoutStatus, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { istDayEnd, istDayStart, istParts } from "../common/date.util";
import type { AuthUser } from "../auth/auth.decorators";

export type Severity = "high" | "medium" | "info";

export type Notification = {
  id: string;
  kind: "newlead" | "partner" | "form" | "followup" | "stalled" | "sanction" | "login" | "unassigned" | "commission";
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

    const [newLeads, partnerApps, submittedForms, due, stalled, expiring, login, unassigned, unpaid] = await Promise.all([
      // A website enquiry nobody has picked up yet. It clears as soon as its status moves on from New.
      this.prisma.lead.findMany({
        where: {
          ...leadScope,
          status: LeadStatus.NEW,
          archivedAt: null,
          // Leads with no owner are listed separately below, for managers.
          ...(staff ? {} : { assignedOfficerId: { not: null } }),
          createdAt: { gte: new Date(now.getTime() - 14 * DAY) },
        },
        orderBy: { createdAt: "desc" },
        take: PER_KIND,
        select: { id: true, leadNo: true, name: true, phone: true, city: true, source: true, createdAt: true },
      }),
      // Someone asked on the website to become a partner. Managers and admins decide these.
      staff
        ? []
        : this.prisma.partnerApplication.findMany({
            where: { status: "NEW" },
            orderBy: { createdAt: "desc" },
            take: PER_KIND,
            select: { id: true, applicationNo: true, kind: true, name: true, phone: true, organisation: true, createdAt: true },
          }),
      // A customer has sent in their application form and nobody has taken the file forward yet.
      this.prisma.application.findMany({
        where: {
          ...appScope,
          status: ApplicationStatus.DRAFT,
          archivedAt: null,
          invites: { some: { submittedAt: { not: null }, revokedAt: null } },
        },
        orderBy: { updatedAt: "asc" },
        take: PER_KIND,
        select: {
          id: true,
          seq: true,
          createdAt: true,
          ...primary,
          invites: { where: { submittedAt: { not: null } }, orderBy: { submittedAt: "desc" }, take: 1, select: { submittedAt: true } },
        },
      }),
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
            select: { id: true, leadNo: true, name: true, source: true, createdAt: true },
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

    const ago = (d: Date) => {
      const mins = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60_000));
      if (mins < 60) return `${plural(mins, "minute")} ago`;
      if (mins < 1440) return `${plural(Math.floor(mins / 60), "hour")} ago`;
      return `${plural(Math.floor(mins / 1440), "day")} ago`;
    };
    for (const l of newLeads) {
      items.push({
        id: `newlead-${l.id}`,
        kind: "newlead",
        severity: "high",
        title: `New enquiry from ${l.name}`,
        detail: `#${l.leadNo} · ${l.source}${l.city ? ` · ${l.city}` : ""} · ${l.phone} · ${ago(l.createdAt)}`,
        path: `/leads/${l.id}`,
        since: l.createdAt.toISOString(),
      });
    }
    for (const p of partnerApps) {
      items.push({
        id: `partner-${p.id}`,
        kind: "partner",
        severity: "high",
        title: `${p.name} wants to become a partner`,
        detail: `${p.kind}${p.organisation ? ` · ${p.organisation}` : ""} · ${p.phone} · ${ago(p.createdAt)}`,
        path: "/partners",
        since: p.createdAt.toISOString(),
      });
    }
    for (const a of submittedForms) {
      const sent = a.invites[0]?.submittedAt ?? a.createdAt;
      items.push({
        id: `form-${a.id}`,
        kind: "form",
        severity: "high",
        title: `${person(a)} sent in their application form`,
        detail: `${appNo(a)} · check the details and documents, then submit to a lender`,
        path: `/applications/${a.id}`,
        hash: "customer-form",
        since: sent.toISOString(),
      });
    }
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
        // A fresh enquiry with nobody on it is urgent; one that has been waiting for weeks is a reminder.
        severity: daysAgo(l.createdAt) <= 3 ? "high" : "info",
        title: daysAgo(l.createdAt) <= 3 ? `New enquiry from ${l.name}, no owner yet` : `${l.name} has no owner`,
        detail: `#${l.leadNo} · ${l.source} · ${ago(l.createdAt)} · waiting to be given to someone`,
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
