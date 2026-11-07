import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ApplicationStatus, PayoutStatus, Prisma, SanctionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { describeRange, rangeFilter, resolveRange, type Range } from "../common/date.util";
import { ReportsService } from "./reports.service";
import { collect } from "./report-records.service";
import { canSeeCommission } from "./report-catalogue";
import { appFilterWhere, appScope, leadFilterWhere, leadScope, sanctionedInRange, type ReportRange, type SourceFilters } from "./report-scope";
import {
  bucketMonths,
  commissionBuckets,
  currentMonthRange,
  lastMonths,
  loanTypeBreakdown,
  monthSpan,
  monthsInRange,
  stageBreakdown,
  type Item,
} from "./report-aggregate";
import { ACTIVE_FILE_STATUSES, callbackStage, FILE_STAGE_LABEL, isReportKind, KINDS, REPORT_KINDS, rejectStage, type ReportKind } from "./report-kinds";

export type DetailFilters = ReportRange & SourceFilters;

const UNKNOWN_TYPE = "Not specified";
const money = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

@Injectable()
export class ReportInsightsService {
  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
  ) {}

  /** The hub's cards: which detailed reports exist for this person. */
  kindsFor(user: AuthUser) {
    return REPORT_KINDS.filter((k) => !KINDS[k].commission || canSeeCommission(user.role)).map((k) => ({
      kind: k,
      title: KINDS[k].title,
      blurb: KINDS[k].blurb,
    }));
  }

  /**
   * Everything on the Reports landing page in one go: headline numbers, the last six months, the file
   * pipeline, the best lenders and (for Admin and Manager) the commission position. The date range narrows the
   * headline numbers, pipeline, lenders and commission; the trend always shows the six months up to now.
   */
  async hub(f: ReportRange, user: AuthUser, now: Date = new Date()) {
    const range = resolveRange(f);
    const created = rangeFilter(range);
    const month = currentMonthRange(now);
    const thisMonth = rangeFilter(month)!;
    const withCommission = canSeeCommission(user.role);

    const approved = { financialStatus: SanctionStatus.APPROVED, application: appScope(user) };
    const leadWhere: Prisma.LeadWhereInput = { ...leadScope(user), ...(created && { createdAt: created }) };

    const [leads, leadsMonth, active, activeLoggedIn, sanctioned, sanctionedMonth, disbursed, disbursedMonth, pipeline] =
      await Promise.all([
        this.prisma.lead.count({ where: leadWhere }),
        this.prisma.lead.count({ where: { ...leadScope(user), createdAt: thisMonth } }),
        this.prisma.application.count({
          where: { ...appScope(user), status: { in: ACTIVE_FILE_STATUSES as unknown as ApplicationStatus[] }, ...(created && { createdAt: created }) },
        }),
        this.prisma.application.count({
          where: {
            ...appScope(user),
            status: { in: ACTIVE_FILE_STATUSES as unknown as ApplicationStatus[] },
            bankLoginAt: { not: null },
            ...(created && { createdAt: created }),
          },
        }),
        this.prisma.sanction.aggregate({ where: { ...approved, ...sanctionedInRange(range) }, _count: true, _sum: { sanctionedAmount: true } }),
        this.prisma.sanction.aggregate({ where: { ...approved, ...sanctionedInRange(month) }, _count: true }),
        this.prisma.disbursement.aggregate({
          where: { application: appScope(user), ...(created && { disbursedAt: created }) },
          _count: true,
          _sum: { amount: true },
        }),
        this.prisma.disbursement.aggregate({ where: { application: appScope(user), disbursedAt: thisMonth }, _count: true, _sum: { amount: true } }),
        this.prisma.application.groupBy({
          by: ["status"],
          where: { ...appScope(user), ...(created && { createdAt: created }) },
          _count: { _all: true },
          orderBy: { status: "asc" },
        }),
      ]);

    const commission = withCommission ? await this.commissionPosition(range) : null;
    const monthTotals = withCommission ? await this.commissionPosition(month) : null;
    const prevMonth = monthSpan([lastMonths(2, now)[0]]);
    const compare = await this.monthOverMonth(user, month, prevMonth, withCommission);
    const extras = await this.overviewExtras(user, range, created, withCommission);
    const { funnel, loanTypes, lostReasons } = await this.shape(user, range, leads, sanctioned._count);

    return {
      range: { from: range.from?.toISOString() ?? null, to: range.to?.toISOString() ?? null, label: describeRange(range, f.range) },
      kpis: {
        leads: { total: leads, thisMonth: leadsMonth },
        activeFiles: { total: active, loggedIn: activeLoggedIn },
        sanctioned: { count: sanctioned._count, amount: money(sanctioned._sum.sanctionedAmount), thisMonth: sanctionedMonth._count },
        disbursed: {
          count: disbursed._count,
          amount: money(disbursed._sum.amount),
          thisMonth: disbursedMonth._count,
          thisMonthAmount: money(disbursedMonth._sum.amount),
        },
        commission: commission && monthTotals ? { total: commission.total, pending: commission.due + commission.claimed, thisMonth: monthTotals.total } : null,
        /** This month against the month before, as a percentage change (null when there was nothing to compare). */
        change: compare,
      },
      rejectionReasons: extras.rejectionReasons,
      counts: extras.counts,
      trends: await this.trends(user, now),
      pipeline: {
        total: pipeline.reduce((n, r) => n + (r._count._all ?? 0), 0),
        stages: Object.entries(FILE_STAGE_LABEL).map(([key, label]) => ({
          key,
          label,
          count: pipeline.find((r) => r.status === key)?._count._all ?? 0,
        })),
      },
      lenders: (await this.reports.byLender(f, user))
        .filter((l) => l.sanctionedAmount > 0)
        .sort((a, b) => b.sanctionedAmount - a.sanctionedAmount)
        .slice(0, 8)
        .map((l) => ({
          lender: l.lender,
          sanctions: l.sanctions,
          rejected: l.rejected,
          approvalRate: l.approvalRate,
          sanctionedAmount: l.sanctionedAmount,
          disbursedAmount: l.disbursedAmount,
        })),
      funnel,
      loanTypes,
      lostReasons,
      commission,
      reports: this.kindsFor(user),
    };
  }

  /**
   * The hub's three "where does it go" panels, for the same period and the same people as the headline numbers:
   * the conversion funnel from enquiry to payout, files by loan type, and why enquiries are lost. (A file has no
   * rejection reason of its own, so the reasons shown are the ones recorded when a lead is closed out as lost.)
   */
  private async shape(user: AuthUser, range: Range, leads: number, sanctions: number) {
    const created = rangeFilter(range);
    const files = { ...appScope(user), ...(created && { createdAt: created }) };

    const [fileCount, loggedIn, disbursedFiles, byType, lost] = await Promise.all([
      this.prisma.application.count({ where: files }),
      this.prisma.application.count({ where: { ...files, bankLoginAt: { not: null } } }),
      this.prisma.disbursement.findMany({
        where: { application: appScope(user), ...(created && { disbursedAt: created }) },
        distinct: ["applicationId"],
        select: { applicationId: true },
      }),
      this.prisma.application.groupBy({
        by: ["loanProductId"],
        where: files,
        _count: { _all: true },
        _sum: { requestedAmount: true },
        orderBy: { loanProductId: "asc" },
      }),
      this.prisma.lead.groupBy({
        by: ["lostReason"],
        where: { ...leadScope(user), status: "LOST", ...(created && { createdAt: created }) },
        _count: { _all: true },
        orderBy: { lostReason: "asc" },
      }),
    ]);

    const steps = [
      { key: "leads", label: "Leads", count: leads },
      { key: "files", label: "Files opened", count: fileCount },
      { key: "logged-in", label: "Logged in with a bank", count: loggedIn },
      { key: "sanctioned", label: "Sanctioned", count: sanctions },
      { key: "disbursed", label: "Disbursed", count: disbursedFiles.length },
    ];
    const funnel = steps.map((st, i) => ({
      ...st,
      // Each step against the one before it, and against the first — never above 100%.
      ofPrevious: i === 0 ? null : steps[i - 1].count > 0 ? Math.min(Math.round((st.count / steps[i - 1].count) * 100), 100) : null,
      ofFirst: steps[0].count > 0 ? Math.min(Math.round((st.count / steps[0].count) * 100), 100) : null,
    }));

    const products = await this.prisma.loanProduct.findMany({
      where: { id: { in: byType.map((r) => r.loanProductId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(products.map((p) => [p.id, p.name]));
    const types = byType
      .map((r) => ({ name: nameOf.get(r.loanProductId) ?? UNKNOWN_TYPE, count: r._count._all, amount: money(r._sum.requestedAmount) }))
      .sort((a, b) => b.count - a.count);
    // Eight slices read; the rest are folded into one so a long tail doesn't crowd the chart.
    const loanTypes =
      types.length > 8
        ? [...types.slice(0, 7), types.slice(7).reduce((acc, t) => ({ name: "Other loan types", count: acc.count + t.count, amount: acc.amount + t.amount }), { name: "Other loan types", count: 0, amount: 0 })]
        : types;

    const lostReasons = lost
      .map((r) => ({ reason: r.lostReason?.trim() || "No reason recorded", count: r._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return { funnel, loanTypes, lostReasons };
  }

  /** Percentage change of this month on the one before, for the four headline cards. */
  private async monthOverMonth(user: AuthUser, month: Range, prev: Range, withCommission: boolean) {
    const at = (r: Range) => rangeFilter(r)!;
    const approved = { financialStatus: SanctionStatus.APPROVED, application: appScope(user) };
    const one = async (r: Range) => {
      const [leads, sanc, disb] = await Promise.all([
        this.prisma.lead.count({ where: { ...leadScope(user), createdAt: at(r) } }),
        this.prisma.sanction.aggregate({ where: { ...approved, ...sanctionedInRange(r) }, _sum: { sanctionedAmount: true } }),
        this.prisma.disbursement.aggregate({ where: { application: appScope(user), disbursedAt: at(r) }, _sum: { amount: true } }),
      ]);
      const comm = withCommission ? (await this.commissionPosition(r)).total : null;
      return { leads, sanctioned: money(sanc._sum.sanctionedAmount), disbursed: money(disb._sum.amount), commission: comm };
    };
    const [now, before] = await Promise.all([one(month), one(prev)]);
    const change = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10);
    return {
      leads: change(now.leads, before.leads),
      sanctioned: change(now.sanctioned, before.sanctioned),
      disbursed: change(now.disbursed, before.disbursed),
      commission: change(now.commission, before.commission),
    };
  }

  /** Why files were turned down (where lenders' reasons were recorded) and the per-report record counts for the report cards. */
  private async overviewExtras(user: AuthUser, range: Range, created: ReturnType<typeof rangeFilter>, withCommission: boolean) {
    const apps = appScope(user);
    const inRange = created && { createdAt: created };
    const [leads, files, loggedIn, sanctioned, followUps, sanctionRows, disbRows, rejected, commissions, outcomes] =
      await Promise.all([
        this.prisma.lead.count({ where: { ...leadScope(user), ...inRange } }),
        this.prisma.application.count({ where: { ...apps, ...inRange } }),
        this.prisma.application.count({ where: { ...apps, bankLoginAt: created ?? { not: null } } }),
        this.prisma.sanction.count({ where: { financialStatus: SanctionStatus.APPROVED, application: apps, ...sanctionedInRange(range) } }),
        this.prisma.followUp.count({ where: { lead: leadScope(user), ...(created && { OR: [{ dueAt: created }, { dueAt: null, createdAt: created }] }) } }),
        this.prisma.sanction.count({ where: { application: apps, ...sanctionedInRange(range) } }),
        this.prisma.disbursement.count({ where: { application: apps, ...(created && { disbursedAt: created }) } }),
        this.prisma.application.count({ where: { ...apps, status: ApplicationStatus.REJECTED, ...(created && { updatedAt: created }) } }),
        withCommission ? this.prisma.commission.count({ where: created ? { disbursement: { disbursedAt: created } } : {} }) : Promise.resolve(null),
        this.prisma.caseOutcome.findMany({
          where: { rejectionReason: { not: null }, ...(created && { createdAt: created }) },
          select: { rejectionReason: true, applicationId: true },
        }),
      ]);

    // Staff only learn about rejections on their own files.
    let reasons = outcomes;
    if (user.role === "ADVISOR") {
      const mine = new Set((await this.prisma.application.findMany({ where: apps, select: { id: true } })).map((a) => a.id));
      reasons = outcomes.filter((o) => o.applicationId && mine.has(o.applicationId));
    }
    const reasonCount = new Map<string, number>();
    for (const o of reasons) {
      const key = o.rejectionReason!.trim().replace(/\s+/g, " ").slice(0, 80);
      if (key) reasonCount.set(key, (reasonCount.get(key) ?? 0) + 1);
    }

    return {
      rejectionReasons: [...reasonCount.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8),
      counts: {
        leads,
        callbacks: followUps,
        files,
        "login-files": loggedIn,
        sanctions: sanctionRows,
        disbursals: disbRows,
        rejects: rejected,
        ...(commissions === null ? {} : { commissions }),
      } as Record<string, number>,
    };
  }

  /** Leads, files, sanctions and disbursals per month for the six months up to `now`. */
  private async trends(user: AuthUser, now: Date) {
    const months = lastMonths(6, now);
    const span = monthSpan(months);
    const window = rangeFilter(span)!;

    const [leads, files, sanctions, disbursals] = await Promise.all([
      this.prisma.lead.findMany({ where: { ...leadScope(user), createdAt: window }, select: { createdAt: true } }),
      this.prisma.application.findMany({ where: { ...appScope(user), createdAt: window }, select: { createdAt: true } }),
      this.prisma.sanction.findMany({
        where: { financialStatus: SanctionStatus.APPROVED, application: appScope(user), ...sanctionedInRange(span) },
        select: { sanctionDate: true, createdAt: true },
      }),
      this.prisma.disbursement.findMany({
        where: { application: appScope(user), disbursedAt: window },
        select: { disbursedAt: true },
      }),
    ]);

    const series = {
      leads: bucketMonths(leads.map((r) => ({ at: r.createdAt })), months),
      files: bucketMonths(files.map((r) => ({ at: r.createdAt })), months),
      sanctions: bucketMonths(sanctions.map((r) => ({ at: r.sanctionDate ?? r.createdAt })), months),
      disbursals: bucketMonths(disbursals.map((r) => ({ at: r.disbursedAt })), months),
    };
    return months.map((m, i) => ({
      month: m.month,
      label: m.label,
      leads: series.leads[i].count,
      files: series.files[i].count,
      sanctions: series.sanctions[i].count,
      disbursals: series.disbursals[i].count,
    }));
  }

  /** Commission due, claimed and received on payouts in a window (dated by disbursal, like the register). */
  private async commissionPosition(range: Range) {
    const disbursedAt = rangeFilter(range);
    const rows = await this.prisma.commission.findMany({
      where: { ...(disbursedAt && { disbursement: { disbursedAt } }) },
      select: { status: true, grossAmount: true, receivedAmount: true },
    });
    return commissionBuckets(
      rows.map((r) => ({ stage: r.status, amount: Number(r.grossAmount), received: r.receivedAmount == null ? undefined : Number(r.receivedAmount) })),
    );
  }

  /**
   * One of the eight detailed reports: headline tiles, the stage chart and table, the monthly trend, and the
   * loan-type split. Staff only ever see their own leads and files, and never commission.
   */
  async detail(kindParam: string, f: DetailFilters, user: AuthUser, now: Date = new Date()) {
    if (!isReportKind(kindParam)) throw new NotFoundException("Unknown report");
    const def = KINDS[kindParam];
    if (def.commission && !canSeeCommission(user.role)) {
      throw new ForbiddenException("Commission reports are for Admin and Manager");
    }
    const range = resolveRange(f);
    const items = await this.load(kindParam, f, range, user, now);

    const months = monthsInRange(range, now);
    return {
      kind: def.kind,
      title: def.title,
      blurb: def.blurb,
      stageTitle: def.stageTitle,
      amountLabel: def.amountLabel,
      rangeLabel: describeRange(range, f.range),
      tiles: def.tiles(items, now),
      total: { count: items.length, amount: items.reduce((s, i) => s + i.amount, 0) },
      stages: stageBreakdown(items, def.stages),
      trend: bucketMonths(items, months),
      loanTypes: loanTypeBreakdown(items),
    };
  }

  /** The bare records each report counts, read a batch at a time and narrowed by the same filters as the rest of the CRM. */
  private async load(kind: ReportKind, f: DetailFilters, range: Range, user: AuthUser, now: Date): Promise<Item[]> {
    const created = rangeFilter(range);
    const appWhere = appFilterWhere(f, user);
    const typeOf = (p: { name: string } | null | undefined) => p?.name ?? UNKNOWN_TYPE;

    switch (kind) {
      case "leads": {
        const where: Prisma.LeadWhereInput = { ...leadFilterWhere(f, user), ...(created && { createdAt: created }) };
        const { rows } = await collect(
          (p) =>
            this.prisma.lead.findMany({
              where,
              select: { id: true, createdAt: true, status: true, amount: true, loanProduct: { select: { name: true } } },
              orderBy: { id: "asc" },
              ...p,
            }),
          null,
        );
        return rows.map((r) => ({ at: r.createdAt, stage: r.status, loanType: typeOf(r.loanProduct), amount: money(r.amount) }));
      }

      case "callbacks": {
        // Dated by when it is due; one with no due date counts on the day it was booked.
        const where: Prisma.FollowUpWhereInput = {
          lead: leadFilterWhere(f, user),
          ...(created && { OR: [{ dueAt: created }, { dueAt: null, createdAt: created }] }),
        };
        const { rows } = await collect(
          (p) =>
            this.prisma.followUp.findMany({
              where,
              select: {
                id: true,
                dueAt: true,
                doneAt: true,
                createdAt: true,
                lead: { select: { amount: true, loanProduct: { select: { name: true } } } },
              },
              orderBy: { id: "asc" },
              ...p,
            }),
          null,
        );
        return rows.map((r) => ({
          at: r.dueAt ?? r.createdAt,
          stage: callbackStage(r, now),
          loanType: typeOf(r.lead.loanProduct),
          amount: money(r.lead.amount),
        }));
      }

      case "files":
      case "login-files": {
        const login = kind === "login-files";
        const where: Prisma.ApplicationWhereInput = {
          ...appWhere,
          ...(login ? { bankLoginAt: created ? { ...created } : { not: null } } : created && { createdAt: created }),
        };
        const { rows } = await collect(
          (p) =>
            this.prisma.application.findMany({
              where,
              select: { id: true, createdAt: true, bankLoginAt: true, status: true, requestedAmount: true, loanProduct: { select: { name: true } } },
              orderBy: { id: "asc" },
              ...p,
            }),
          null,
        );
        return rows.map((r) => ({
          at: login ? (r.bankLoginAt as Date) : r.createdAt,
          stage: r.status,
          loanType: typeOf(r.loanProduct),
          amount: money(r.requestedAmount),
        }));
      }

      case "sanctions": {
        const where: Prisma.SanctionWhereInput = { application: appWhere, ...sanctionedInRange(range) };
        const { rows } = await collect(
          (p) =>
            this.prisma.sanction.findMany({
              where,
              select: {
                id: true,
                sanctionDate: true,
                createdAt: true,
                financialStatus: true,
                sanctionedAmount: true,
                application: { select: { loanProduct: { select: { name: true } } } },
              },
              orderBy: { id: "asc" },
              ...p,
            }),
          null,
        );
        return rows.map((r) => ({
          at: r.sanctionDate ?? r.createdAt,
          stage: r.financialStatus,
          loanType: typeOf(r.application.loanProduct),
          amount: money(r.sanctionedAmount),
        }));
      }

      case "disbursals": {
        const where: Prisma.DisbursementWhereInput = { application: appWhere, ...(created && { disbursedAt: created }) };
        const { rows } = await collect(
          (p) =>
            this.prisma.disbursement.findMany({
              where,
              select: {
                id: true,
                disbursedAt: true,
                mode: true,
                type: true,
                amount: true,
                application: { select: { loanProduct: { select: { name: true } } } },
              },
              orderBy: { id: "asc" },
              ...p,
            }),
          null,
        );
        return rows.map((r) => ({
          at: r.disbursedAt,
          stage: r.mode ?? "UNSPECIFIED",
          tag: r.type,
          loanType: typeOf(r.application.loanProduct),
          amount: money(r.amount),
        }));
      }

      case "rejects": {
        // There is no "rejected on" date, so the last time the file changed stands in for it; the status index narrows the read.
        const where: Prisma.ApplicationWhereInput = { ...appWhere, status: ApplicationStatus.REJECTED, ...(created && { updatedAt: created }) };
        const { rows } = await collect(
          (p) =>
            this.prisma.application.findMany({
              where,
              select: {
                id: true,
                updatedAt: true,
                bankLoginAt: true,
                requestedAmount: true,
                loanProduct: { select: { name: true } },
                sanction: { select: { financialStatus: true } },
              },
              orderBy: { id: "asc" },
              ...p,
            }),
          null,
        );
        return rows.map((r) => ({
          at: r.updatedAt,
          stage: rejectStage({ bankLoginAt: r.bankLoginAt, sanctionFinancialStatus: r.sanction?.financialStatus ?? null }),
          loanType: typeOf(r.loanProduct),
          amount: money(r.requestedAmount),
        }));
      }

      case "commissions": {
        const where: Prisma.CommissionWhereInput = { disbursement: { application: appWhere, ...(created && { disbursedAt: created }) } };
        const { rows } = await collect(
          (p) =>
            this.prisma.commission.findMany({
              where,
              select: {
                id: true,
                status: true,
                grossAmount: true,
                receivedAmount: true,
                disbursement: { select: { disbursedAt: true, application: { select: { loanProduct: { select: { name: true } } } } } },
              },
              orderBy: { id: "asc" },
              ...p,
            }),
          null,
        );
        return rows.map((r) => ({
          at: r.disbursement.disbursedAt,
          stage: r.status as PayoutStatus,
          loanType: typeOf(r.disbursement.application.loanProduct),
          amount: money(r.grossAmount),
          received: r.receivedAmount == null ? undefined : Number(r.receivedAmount),
        }));
      }
    }
  }
}
