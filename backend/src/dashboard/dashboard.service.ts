import { Injectable } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { describeRange, rangeFilter, resolveRange, type RangeInput } from "../common/date.util";
import { lastMonths } from "../reports/report-aggregate";
import { addTo, leadTrend, leaderboard, segmentMix, topSources } from "./dashboard-analytics";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(user: AuthUser, input: RangeInput = {}) {
    const window = resolveRange(input);
    const bounds = rangeFilter(window);
    const within = (field: string) => (bounds ? { [field]: bounds } : {});

    const leadScope: Prisma.LeadWhereInput = {
      ...(user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {}),
      ...within("createdAt"),
    };
    const ownerScope: Prisma.ApplicationWhereInput =
      user.role === Role.ADVISOR ? { ownerId: user.id } : {};
    const appScope: Prisma.ApplicationWhereInput = { ...ownerScope, ...within("createdAt") };

    const [
      byStatus,
      totalLeads,
      dueFollowUps,
      applications,
      sanctions,
      disbursedAgg,
      commissionAgg,
      requestedAgg,
      sanctionedAgg,
      byProduct,
      products,
    ] = await this.prisma.$transaction([
      this.prisma.lead.groupBy({
        by: ["status"],
        where: leadScope,
        _count: true,
        orderBy: { status: "asc" },
      }),
      this.prisma.lead.count({ where: leadScope }),
      this.prisma.lead.count({
        where: {
          ...(user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {}),
          nextFollowUpAt: { lte: new Date() },
        },
      }),
      this.prisma.application.count({ where: appScope }),
      this.prisma.sanction.count({
        where: { application: ownerScope, ...within("createdAt") },
      }),
      this.prisma.disbursement.aggregate({
        where: { application: ownerScope, ...within("disbursedAt") },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.commission.aggregate({
        where: { disbursement: { application: ownerScope }, ...within("createdAt") },
        _sum: { grossAmount: true },
      }),
      this.prisma.application.aggregate({ where: appScope, _sum: { requestedAmount: true } }),
      this.prisma.sanction.aggregate({
        where: { application: ownerScope, ...within("createdAt") },
        _sum: { sanctionedAmount: true },
      }),
      this.prisma.application.groupBy({
        by: ["loanProductId"],
        where: appScope,
        _count: true,
        _sum: { requestedAmount: true },
        orderBy: { loanProductId: "asc" },
      }),
      this.prisma.loanProduct.findMany({ select: { id: true, name: true } }),
    ]);

    const productName = new Map(products.map((p) => [p.id, p.name]));
    const loanDistribution = byProduct
      .map((r) => ({
        name: r.loanProductId ? (productName.get(r.loanProductId) ?? "Other") : "Unspecified",
        count: Number(r._count ?? 0),
        amount: Number(r._sum?.requestedAmount ?? 0),
      }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount);

    const statusCount = Object.fromEntries(byStatus.map((r) => [r.status, Number(r._count ?? 0)]));
    const requested = Number(requestedAgg._sum.requestedAmount ?? 0);
    const sanctioned = Number(sanctionedAgg._sum.sanctionedAmount ?? 0);
    const disbursed = Number(disbursedAgg._sum.amount ?? 0);
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

    return {
      range: input.range ?? (bounds ? "custom" : "all"),
      period: describeRange(window, input.range),
      leads: { total: totalLeads, dueFollowUps, byStatus: statusCount },
      applications,
      sanctions,
      disbursements: { count: disbursedAgg._count, amount: disbursedAgg._sum.amount ?? 0 },
      commissionEarned: user.role === Role.ADVISOR ? null : (commissionAgg._sum.grossAmount ?? 0),
      loanDistribution,
      performance: {
        leadToApplicationPct: pct(Number(statusCount.CONVERTED ?? 0), totalLeads),
        applicationToSanctionPct: pct(sanctions, applications),
        sanctionedToDisbursedPct: pct(disbursed, sanctioned),
        averageTicket: applications ? Math.round(requested / applications) : 0,
        requestedAmount: requested,
        sanctionedAmount: sanctioned,
        disbursedAmount: disbursed,
      },
    };
  }

  /**
   * Analytics for each module, for the Dashboard's "Module analytics" tabs. Advisors get their own leads only; the team
   * table and the channel figures (website, WhatsApp, AI calls) are for managers and admins. The period applies to
   * what came in during it; the priority mix and the counts that need action are as of now.
   */
  async analytics(user: AuthUser, input: RangeInput = {}) {
    const bounds = rangeFilter(resolveRange(input));
    const within = (field: string) => (bounds ? { [field]: bounds } : {});
    const staff = user.role !== Role.ADVISOR;
    const mine: Prisma.LeadWhereInput = user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {};
    const open: Prisma.LeadWhereInput = { archivedAt: null, status: { notIn: ["CONVERTED", "LOST"] } };
    const months = lastMonths(6);
    const sixMonthsAgo = new Date(Date.now() - 190 * 86_400_000);

    const [bySource, bySegment, unassigned, overdue, recent] = await Promise.all([
      this.prisma.lead.groupBy({ by: ["source"], where: { ...mine, ...within("createdAt") }, _count: { _all: true }, orderBy: { source: "asc" } }),
      this.prisma.lead.groupBy({ by: ["segment"], where: { ...mine, ...open }, _count: { _all: true }, orderBy: { segment: "asc" } }),
      staff ? this.prisma.lead.count({ where: { ...open, assignedOfficerId: null } }) : Promise.resolve(0),
      this.prisma.lead.count({ where: { ...mine, ...open, nextFollowUpAt: { lte: new Date() } } }),
      this.prisma.lead.findMany({ where: { ...mine, createdAt: { gte: sixMonthsAgo } }, select: { createdAt: true, status: true } }),
    ]);

    const leads = {
      sources: topSources(bySource.map((r) => ({ source: r.source, count: r._count._all }))),
      priority: segmentMix(bySegment.map((r) => ({ segment: r.segment, count: r._count._all }))),
      unassigned,
      overdueFollowUps: overdue,
      trend: leadTrend(recent, months),
    };
    if (!staff) return { leads, team: null, channels: null };

    const [people, leadsBy, convertedBy, appsBy, followBy, payouts, subs, newLeadSubs, waNeedsHuman, waUnread, waIn, waOut, calls, callLeads, callAvg] = await Promise.all([
      this.prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true } }),
      this.prisma.lead.groupBy({ by: ["assignedOfficerId"], where: { ...within("createdAt"), assignedOfficerId: { not: null } }, _count: { _all: true }, orderBy: { assignedOfficerId: "asc" } }),
      this.prisma.lead.groupBy({ by: ["assignedOfficerId"], where: { ...within("createdAt"), assignedOfficerId: { not: null }, status: "CONVERTED" }, _count: { _all: true }, orderBy: { assignedOfficerId: "asc" } }),
      this.prisma.application.groupBy({ by: ["ownerId"], where: { ...within("createdAt"), ownerId: { not: null } }, _count: { _all: true }, orderBy: { ownerId: "asc" } }),
      this.prisma.followUp.groupBy({ by: ["userId"], where: within("createdAt"), _count: { _all: true }, orderBy: { userId: "asc" } }),
      this.prisma.disbursement.findMany({ where: within("disbursedAt"), select: { amount: true, application: { select: { ownerId: true } } } }),
      this.prisma.websiteSubmission.groupBy({ by: ["form"], where: within("receivedAt"), _count: { _all: true }, orderBy: { form: "asc" } }),
      this.prisma.websiteSubmission.count({ where: { ...within("receivedAt"), outcome: "NEW_LEAD" } }),
      this.prisma.whatsAppConversation.count({ where: { needsHuman: true } }),
      this.prisma.whatsAppConversation.aggregate({ _sum: { unreadCount: true } }),
      this.prisma.whatsAppMessage.count({ where: { direction: "IN", ...within("createdAt") } }),
      this.prisma.whatsAppMessage.count({ where: { direction: "OUT", ...within("createdAt") } }),
      this.prisma.voiceCall.count({ where: within("receivedAt") }),
      this.prisma.voiceCall.count({ where: { ...within("receivedAt"), outcome: "LEAD_CREATED" } }),
      this.prisma.voiceCall.aggregate({ where: { ...within("receivedAt"), durationSec: { gt: 0 } }, _avg: { durationSec: true } }),
    ]);

    const toMap = (rows: { key: string | null; n: number }[]) => new Map(rows.filter((r) => r.key).map((r) => [r.key as string, r.n]));
    const disbursed = new Map<string, number>();
    for (const d of payouts) addTo(disbursed, d.application.ownerId, Number(d.amount));
    const team = leaderboard(people, {
      leads: toMap(leadsBy.map((r) => ({ key: r.assignedOfficerId, n: r._count._all }))),
      converted: toMap(convertedBy.map((r) => ({ key: r.assignedOfficerId, n: r._count._all }))),
      applications: toMap(appsBy.map((r) => ({ key: r.ownerId, n: r._count._all }))),
      followUps: toMap(followBy.map((r) => ({ key: r.userId, n: r._count._all }))),
      disbursed,
    });

    const byForm = subs.map((r) => ({ form: r.form, count: r._count._all })).sort((a, b) => b.count - a.count);
    return {
      leads,
      team,
      channels: {
        website: {
          received: byForm.reduce((n, f) => n + f.count, 0),
          newLeads: newLeadSubs,
          caLegal: byForm.find((f) => f.form === "ca-legal-enquiry")?.count ?? 0,
          byForm: byForm.slice(0, 6),
        },
        whatsapp: { needsHuman: waNeedsHuman, unread: waUnread._sum.unreadCount ?? 0, received: waIn, sent: waOut },
        voice: { calls, leadsCreated: callLeads, avgSeconds: Math.round(callAvg._avg.durationSec ?? 0) },
      },
    };
  }
}
