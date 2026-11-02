import { Injectable } from "@nestjs/common";
import { ApplicationStatus, LeadStatus, Prisma, SanctionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { SettingsService } from "../settings/settings.service";
import { rangeFilter, resolveRange } from "../common/date.util";
import { appScope, leadScope, sanctionedInRange, type ReportRange } from "./report-scope";

export type { ReportRange };

/** groupBy's _count widens to a union under these query shapes; narrow it once. */
const countOf = (count: unknown): number =>
  typeof count === "object" && count !== null ? ((count as { _all?: number })._all ?? 0) : 0;

const dateFilter = (range: ReportRange) => rangeFilter(resolveRange(range));

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  private leadScope(user: AuthUser): Prisma.LeadWhereInput {
    return leadScope(user);
  }

  private appScope(user: AuthUser): Prisma.ApplicationWhereInput {
    return appScope(user);
  }

  /**
   * Stage-by-stage funnel. Counts are of records created in the window, so a
   * case sanctioned this month but raised last month still counts at the
   * sanction stage — which is what "how did this month go" actually means.
   */
  async funnel(range: ReportRange, user: AuthUser) {
    const created = dateFilter(range);

    const [leads, converted, applications, sanctions, disbursed] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { ...this.leadScope(user), ...(created && { createdAt: created }) } }),
      this.prisma.lead.count({
        where: {
          ...this.leadScope(user),
          status: LeadStatus.CONVERTED,
          ...(created && { createdAt: created }),
        },
      }),
      this.prisma.application.aggregate({
        where: { ...this.appScope(user), ...(created && { createdAt: created }) },
        _count: true,
        _sum: { requestedAmount: true },
      }),
      this.prisma.sanction.aggregate({
        where: {
          application: this.appScope(user),
          financialStatus: SanctionStatus.APPROVED,
          ...sanctionedInRange(resolveRange(range)),
        },
        _count: true,
        _sum: { sanctionedAmount: true },
      }),
      this.prisma.disbursement.aggregate({
        where: {
          application: this.appScope(user),
          ...(created && { disbursedAt: created }),
        },
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    return {
      leads,
      converted,
      conversionRate: leads ? Number(((converted / leads) * 100).toFixed(1)) : 0,
      applications: applications._count,
      requestedAmount: applications._sum.requestedAmount ?? 0,
      sanctions: sanctions._count,
      sanctionedAmount: sanctions._sum.sanctionedAmount ?? 0,
      disbursements: disbursed._count,
      disbursedAmount: disbursed._sum.amount ?? 0,
    };
  }

  /** Where leads come from — the number that decides marketing spend. */
  async bySource(range: ReportRange, user: AuthUser) {
    const created = dateFilter(range);
    const rows = await this.prisma.lead.groupBy({
      by: ["source", "status"],
      where: { ...this.leadScope(user), ...(created && { createdAt: created }) },
      _count: { _all: true },
      orderBy: { source: "asc" },
    });

    const bySource = new Map<string, { source: string; leads: number; converted: number }>();
    for (const row of rows) {
      const entry = bySource.get(row.source) ?? { source: row.source, leads: 0, converted: 0 };
      entry.leads += countOf(row._count);
      if (row.status === LeadStatus.CONVERTED) entry.converted += countOf(row._count);
      bySource.set(row.source, entry);
    }

    return [...bySource.values()]
      .map((r) => ({
        ...r,
        conversionRate: r.leads ? Number(((r.converted / r.leads) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.leads - a.leads);
  }

  /** Loan-mix breakdown: which products actually carry the business. */
  async byProduct(range: ReportRange, user: AuthUser) {
    const created = dateFilter(range);

    const products = await this.prisma.loanProduct.findMany({
      select: { id: true, name: true, category: true },
    });

    const [appRows, disbRows] = await this.prisma.$transaction([
      this.prisma.application.groupBy({
        by: ["loanProductId"],
        where: { ...this.appScope(user), ...(created && { createdAt: created }) },
        _count: { _all: true },
        _sum: { requestedAmount: true },
        orderBy: { loanProductId: "asc" },
      }),
      this.prisma.disbursement.findMany({
        where: {
          application: this.appScope(user),
          ...(created && { disbursedAt: created }),
        },
        select: { amount: true, application: { select: { loanProductId: true } } },
      }),
    ]);

    const apps = new Map(appRows.map((r) => [r.loanProductId, r]));
    const disbursed = new Map<string, number>();
    for (const d of disbRows) {
      const key = d.application.loanProductId;
      disbursed.set(key, (disbursed.get(key) ?? 0) + Number(d.amount));
    }

    return products
      .map((p) => ({
        product: p.name,
        category: p.category,
        applications: countOf(apps.get(p.id)?._count),
        requestedAmount: Number(apps.get(p.id)?._sum?.requestedAmount ?? 0),
        disbursedAmount: disbursed.get(p.id) ?? 0,
      }))
      .filter((r) => r.applications > 0 || r.disbursedAmount > 0)
      .sort((a, b) => b.disbursedAmount - a.disbursedAmount);
  }

  /** Which lenders are actually converting the files sent to them. */
  async byLender(range: ReportRange, user: AuthUser) {
    const created = dateFilter(range);

    const lenders = await this.prisma.lender.findMany({ select: { id: true, name: true, type: true } });

    const [appRows, sanctionRows, disbRows, rejectedRows] = await this.prisma.$transaction([
      this.prisma.application.groupBy({
        by: ["lenderId"],
        where: {
          ...this.appScope(user),
          lenderId: { not: null },
          ...(created && { createdAt: created }),
        },
        _count: { _all: true },
        orderBy: { lenderId: "asc" },
      }),
      this.prisma.sanction.findMany({
        where: {
          financialStatus: SanctionStatus.APPROVED,
          application: { ...this.appScope(user), lenderId: { not: null } },
          ...sanctionedInRange(resolveRange(range)),
        },
        select: {
          sanctionedAmount: true,
          interestRate: true,
          createdAt: true,
          application: { select: { lenderId: true, bankLoginAt: true } },
        },
      }),
      this.prisma.disbursement.findMany({
        where: {
          application: { ...this.appScope(user), lenderId: { not: null } },
          ...(created && { disbursedAt: created }),
        },
        select: { amount: true, application: { select: { lenderId: true } } },
      }),
      this.prisma.application.groupBy({
        by: ["lenderId"],
        where: {
          ...this.appScope(user),
          lenderId: { not: null },
          status: ApplicationStatus.REJECTED,
          ...(created && { createdAt: created }),
        },
        _count: { _all: true },
        orderBy: { lenderId: "asc" },
      }),
    ]);

    const apps = new Map(appRows.map((r) => [r.lenderId, countOf(r._count)]));
    const rejected = new Map(rejectedRows.map((r) => [r.lenderId, countOf(r._count)]));
    const sanctioned = new Map<
      string,
      { count: number; amount: number; rateSum: number; rateN: number; tatSum: number; tatN: number }
    >();
    for (const s of sanctionRows) {
      const key = s.application.lenderId!;
      const entry = sanctioned.get(key) ?? { count: 0, amount: 0, rateSum: 0, rateN: 0, tatSum: 0, tatN: 0 };
      entry.count += 1;
      entry.amount += Number(s.sanctionedAmount ?? 0);
      if (s.interestRate != null) {
        entry.rateSum += Number(s.interestRate);
        entry.rateN += 1;
      }
      // Turnaround: from logging in with the bank to the sanction being recorded.
      if (s.application.bankLoginAt) {
        const days = (s.createdAt.getTime() - s.application.bankLoginAt.getTime()) / 86_400_000;
        if (days >= 0) {
          entry.tatSum += days;
          entry.tatN += 1;
        }
      }
      sanctioned.set(key, entry);
    }
    const disbursed = new Map<string, number>();
    for (const d of disbRows) {
      const key = d.application.lenderId!;
      disbursed.set(key, (disbursed.get(key) ?? 0) + Number(d.amount));
    }

    return lenders
      .map((l) => {
        const sn = sanctioned.get(l.id);
        const rej = rejected.get(l.id) ?? 0;
        const decided = (sn?.count ?? 0) + rej;
        const round1 = (n: number) => Math.round(n * 10) / 10;
        return {
          lender: l.name,
          type: l.type,
          applications: apps.get(l.id) ?? 0,
          sanctions: sn?.count ?? 0,
          rejected: rej,
          // Of the files the lender has actually decided, how many it approved.
          approvalRate: decided ? round1(((sn?.count ?? 0) / decided) * 100) : null,
          avgDaysToSanction: sn?.tatN ? round1(sn.tatSum / sn.tatN) : null,
          avgRate: sn?.rateN ? Math.round((sn.rateSum / sn.rateN) * 100) / 100 : null,
          avgSanction: sn?.count ? Math.round(sn.amount / sn.count) : null,
          sanctionedAmount: sn?.amount ?? 0,
          disbursedAmount: disbursed.get(l.id) ?? 0,
        };
      })
      .filter((r) => r.applications > 0)
      .sort((a, b) => b.disbursedAmount - a.disbursedAmount);
  }

  /** Per-officer performance — only meaningful to managers and admins. */
  async byOfficer(range: ReportRange) {
    const created = dateFilter(range);

    const staff = await this.prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });

    const [leadRows, appRows, disbRows] = await this.prisma.$transaction([
      this.prisma.lead.groupBy({
        by: ["assignedOfficerId", "status"],
        where: { assignedOfficerId: { not: null }, ...(created && { createdAt: created }) },
        _count: { _all: true },
        orderBy: { assignedOfficerId: "asc" },
      }),
      this.prisma.application.groupBy({
        by: ["ownerId"],
        where: { ownerId: { not: null }, ...(created && { createdAt: created }) },
        _count: { _all: true },
        orderBy: { ownerId: "asc" },
      }),
      this.prisma.disbursement.findMany({
        where: { ...(created && { disbursedAt: created }) },
        select: { amount: true, application: { select: { ownerId: true } } },
      }),
    ]);

    const leads = new Map<string, { total: number; converted: number }>();
    for (const row of leadRows) {
      const key = row.assignedOfficerId!;
      const entry = leads.get(key) ?? { total: 0, converted: 0 };
      entry.total += countOf(row._count);
      if (row.status === LeadStatus.CONVERTED) entry.converted += countOf(row._count);
      leads.set(key, entry);
    }
    const apps = new Map(appRows.map((r) => [r.ownerId, countOf(r._count)]));
    const disbursed = new Map<string, number>();
    for (const d of disbRows) {
      const key = d.application.ownerId;
      if (key) disbursed.set(key, (disbursed.get(key) ?? 0) + Number(d.amount));
    }

    return staff
      .map((s) => ({
        officer: s.name,
        role: s.role,
        leads: leads.get(s.id)?.total ?? 0,
        converted: leads.get(s.id)?.converted ?? 0,
        applications: apps.get(s.id) ?? 0,
        disbursedAmount: disbursed.get(s.id) ?? 0,
      }))
      .filter((r) => r.leads > 0 || r.applications > 0);
  }

  /** Rejected and stalled cases — the ones worth chasing or learning from. */
  async stalled(user: AuthUser) {
    const days = this.settings.get<number>("pipeline.stalledAfterDays");
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.prisma.application.findMany({
      where: {
        ...this.appScope(user),
        status: { in: [ApplicationStatus.SUBMITTED, ApplicationStatus.BANK_LOGIN, ApplicationStatus.UNDER_REVIEW] },
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        seq: true,
        createdAt: true,
        status: true,
        updatedAt: true,
        requestedAmount: true,
        lender: { select: { name: true } },
        owner: { select: { name: true } },
        applicants: { where: { isPrimary: true }, take: 1, select: { name: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: 50,
    });
  }
}
