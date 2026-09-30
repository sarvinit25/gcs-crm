import { Injectable } from "@nestjs/common";
import { ApplicationStatus, LeadStatus, Prisma, Role, SanctionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { SettingsService } from "../settings/settings.service";
import { describeRange, istParts, rangeFilter, resolveRange, ymd } from "../common/date.util";

export type ReportRange = { range?: string; from?: string; to?: string };

export const RECORD_TYPES = ["leads", "applications", "sanctions", "disbursements", "commissions"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export type RecordFilters = ReportRange & {
  status?: string;
  loanProductId?: string;
  q?: string;
};

export type ColumnType = "text" | "amount" | "date" | "percent" | "number";
export type RecordColumn = { key: string; label: string; type: ColumnType };

/** On-screen preview cap; exports pass a far higher limit so nothing is silently dropped. */
export const PREVIEW_LIMIT = 1000;
export const EXPORT_LIMIT = 100_000;

const TITLES: Record<RecordType, string> = {
  leads: "Leads Report",
  applications: "Applications Report",
  sanctions: "Sanctions Report",
  disbursements: "Disbursements Report",
  commissions: "Commissions Report",
};

// The field whose values are worth tallying per report ("12 converted, 3 lost…").
const TALLY_KEY: Record<RecordType, string> = {
  leads: "status",
  applications: "status",
  sanctions: "financial",
  disbursements: "type",
  commissions: "status",
};

export const prettify = (v: unknown) =>
  typeof v === "string" && /^[A-Z_]+$/.test(v)
    ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ")
    : v;

const COLUMNS: Record<RecordType, RecordColumn[]> = {
  leads: [
    { key: "leadNo", label: "Lead ID", type: "text" },
    { key: "date", label: "Lead date", type: "date" },
    { key: "customer", label: "Customer", type: "text" },
    { key: "phone", label: "Mobile", type: "text" },
    { key: "email", label: "Email", type: "text" },
    { key: "city", label: "City", type: "text" },
    { key: "loanType", label: "Loan type", type: "text" },
    { key: "amount", label: "Loan amount", type: "amount" },
    { key: "source", label: "Source", type: "text" },
    { key: "partner", label: "Sourcing partner", type: "text" },
    { key: "officer", label: "Assigned to", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "lostReason", label: "Lost reason", type: "text" },
  ],
  applications: [
    { key: "applicationNo", label: "Application no.", type: "text" },
    { key: "date", label: "Created", type: "date" },
    { key: "customer", label: "Customer", type: "text" },
    { key: "phone", label: "Mobile", type: "text" },
    { key: "loanType", label: "Loan type", type: "text" },
    { key: "lender", label: "Lender", type: "text" },
    { key: "amount", label: "Requested amount", type: "amount" },
    { key: "tenure", label: "Tenure (months)", type: "number" },
    { key: "bankReferenceNo", label: "Bank reference", type: "text" },
    { key: "loginDate", label: "Bank login", type: "date" },
    { key: "owner", label: "Owner", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ],
  sanctions: [
    { key: "applicationNo", label: "Application no.", type: "text" },
    { key: "date", label: "Updated", type: "date" },
    { key: "customer", label: "Customer", type: "text" },
    { key: "loanType", label: "Loan type", type: "text" },
    { key: "lender", label: "Lender", type: "text" },
    { key: "technical", label: "Technical", type: "text" },
    { key: "financial", label: "Financial", type: "text" },
    { key: "legal", label: "Legal", type: "text" },
    { key: "amount", label: "Sanctioned amount", type: "amount" },
    { key: "rate", label: "Interest rate %", type: "percent" },
    { key: "validTill", label: "Valid till", type: "date" },
    { key: "letterNo", label: "Sanction letter", type: "text" },
  ],
  disbursements: [
    { key: "applicationNo", label: "Application no.", type: "text" },
    { key: "date", label: "Disbursed on", type: "date" },
    { key: "customer", label: "Customer", type: "text" },
    { key: "loanType", label: "Loan type", type: "text" },
    { key: "lender", label: "Lender", type: "text" },
    { key: "type", label: "Type", type: "text" },
    { key: "amount", label: "Amount", type: "amount" },
    { key: "rate", label: "ROI %", type: "percent" },
    { key: "roiType", label: "ROI type", type: "text" },
    { key: "loanAccountNo", label: "Loan account", type: "text" },
    { key: "utrNo", label: "UTR", type: "text" },
    { key: "processingFee", label: "Processing fee", type: "amount" },
  ],
  commissions: [
    { key: "applicationNo", label: "Application no.", type: "text" },
    { key: "date", label: "Disbursed on", type: "date" },
    { key: "customer", label: "Customer", type: "text" },
    { key: "loanType", label: "Loan type", type: "text" },
    { key: "lender", label: "Lender", type: "text" },
    { key: "owner", label: "Owner", type: "text" },
    { key: "disbursed", label: "Disbursed amount", type: "amount" },
    { key: "rate", label: "Gross rate %", type: "percent" },
    { key: "amount", label: "Gross commission", type: "amount" },
    { key: "status", label: "Payout status", type: "text" },
    { key: "receivedAt", label: "Received on", type: "date" },
    { key: "splits", label: "Split between", type: "text" },
  ],
};

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
    return user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {};
  }

  private appScope(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  /** Flat, record-level rows for the report builder: one of five registers, filtered. */
  async records(type: RecordType, f: RecordFilters, user: AuthUser, limit = PREVIEW_LIMIT) {
    const created = dateFilter(f);
    const q = f.q?.trim();
    const day = (d: Date | null | undefined) => (d ? ymd(istParts(d)) : null);
    const num = (v: Prisma.Decimal | null | undefined) => (v == null ? null : Number(v));

    const appSearch = (): Prisma.ApplicationWhereInput =>
      q
        ? {
            OR: [
              { bankReferenceNo: { contains: q, mode: "insensitive" } },
              { applicants: { some: { name: { contains: q, mode: "insensitive" } } } },
              { applicants: { some: { phone: { contains: q } } } },
              ...(/^\d+$/.test(q) ? [{ seq: Number(q) }] : []),
            ],
          }
        : {};
    const appWhere = (): Prisma.ApplicationWhereInput => ({
      ...this.appScope(user),
      ...(f.loanProductId && { loanProductId: f.loanProductId }),
      ...appSearch(),
    });
    const appLabel = (a: { seq: number; createdAt: Date }) => this.settings.applicationNo(a.seq, a.createdAt);
    const appInclude = {
      loanProduct: { select: { name: true } },
      lender: { select: { name: true } },
      applicants: { where: { isPrimary: true }, take: 1, select: { name: true, phone: true } },
    } satisfies Prisma.ApplicationInclude;

    let rows: Record<string, unknown>[] = [];

    switch (type) {
      case "leads": {
        const data = await this.prisma.lead.findMany({
          where: {
            ...this.leadScope(user),
            ...(created && { createdAt: created }),
            ...(f.status && { status: f.status as LeadStatus }),
            ...(f.loanProductId && { loanProductId: f.loanProductId }),
            ...(q && {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }),
          },
          include: {
            loanProduct: { select: { name: true } },
            assignedOfficer: { select: { name: true } },
            sourcingPartner: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
        rows = data.map((l) => ({
          leadNo: `L-${l.leadNo}`,
          date: day(l.createdAt),
          customer: l.name,
          phone: l.phone,
          email: l.email,
          city: l.city,
          loanType: l.loanProduct?.name ?? null,
          amount: num(l.amount),
          source: l.source,
          partner: l.sourcingPartner?.name ?? null,
          officer: l.assignedOfficer?.name ?? null,
          status: l.status,
          lostReason: l.lostReason,
        }));
        break;
      }
      case "applications": {
        const data = await this.prisma.application.findMany({
          where: {
            ...appWhere(),
            ...(created && { createdAt: created }),
            ...(f.status && { status: f.status as ApplicationStatus }),
          },
          include: { ...appInclude, owner: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
        rows = data.map((a) => ({
          applicationNo: appLabel(a),
          date: day(a.createdAt),
          customer: a.applicants[0]?.name ?? null,
          phone: a.applicants[0]?.phone ?? null,
          loanType: a.loanProduct.name,
          lender: a.lender?.name ?? null,
          amount: num(a.requestedAmount),
          tenure: a.tenureMonths,
          bankReferenceNo: a.bankReferenceNo,
          loginDate: day(a.bankLoginAt),
          owner: a.owner?.name ?? null,
          status: a.status,
        }));
        break;
      }
      case "sanctions": {
        const data = await this.prisma.sanction.findMany({
          where: {
            application: appWhere(),
            ...(created && { updatedAt: created }),
            ...(f.status && { financialStatus: f.status as SanctionStatus }),
          },
          include: { application: { include: appInclude } },
          orderBy: { updatedAt: "desc" },
          take: limit,
        });
        rows = data.map((s) => ({
          applicationNo: appLabel(s.application),
          date: day(s.updatedAt),
          customer: s.application.applicants[0]?.name ?? null,
          loanType: s.application.loanProduct.name,
          lender: s.application.lender?.name ?? null,
          technical: s.technicalStatus,
          financial: s.financialStatus,
          legal: s.legalStatus,
          amount: num(s.sanctionedAmount),
          rate: num(s.interestRate),
          validTill: day(s.validTill),
          letterNo: s.sanctionLetterNo,
        }));
        break;
      }
      case "disbursements": {
        const data = await this.prisma.disbursement.findMany({
          where: {
            application: appWhere(),
            ...(created && { disbursedAt: created }),
            ...(f.status && { type: f.status as never }),
          },
          include: { application: { include: appInclude } },
          orderBy: { disbursedAt: "desc" },
          take: limit,
        });
        rows = data.map((d) => ({
          applicationNo: appLabel(d.application),
          date: day(d.disbursedAt),
          customer: d.application.applicants[0]?.name ?? null,
          loanType: d.application.loanProduct.name,
          lender: d.application.lender?.name ?? null,
          type: d.type,
          amount: num(d.amount),
          rate: num(d.interestRate),
          roiType: d.roiType,
          loanAccountNo: d.loanAccountNo,
          utrNo: d.utrNo,
          processingFee: num(d.processingFee),
        }));
        break;
      }
      case "commissions": {
        // Dated by disbursement, like the commission register itself.
        const data = await this.prisma.commission.findMany({
          where: {
            disbursement: { application: appWhere(), ...(created && { disbursedAt: created }) },
            ...(f.status && { status: f.status as never }),
          },
          include: {
            disbursement: {
              include: { application: { include: { ...appInclude, owner: { select: { name: true } } } } },
            },
            splits: {
              include: { user: { select: { name: true } }, sourcingPartner: { select: { name: true } } },
            },
          },
          orderBy: { disbursement: { disbursedAt: "desc" } },
          take: limit,
        });
        rows = data.map((c) => ({
          applicationNo: appLabel(c.disbursement.application),
          date: day(c.disbursement.disbursedAt),
          customer: c.disbursement.application.applicants[0]?.name ?? null,
          loanType: c.disbursement.application.loanProduct.name,
          lender: c.disbursement.application.lender?.name ?? null,
          owner: c.disbursement.application.owner?.name ?? null,
          disbursed: num(c.disbursement.amount),
          rate: num(c.grossRate),
          amount: num(c.grossAmount),
          status: c.status,
          receivedAt: day(c.receivedAt),
          splits:
            c.splits
              .map((x) => {
                const who = x.user?.name ?? x.sourcingPartner?.name ?? "—";
                const role = x.stakeholderRole ? ` (${x.stakeholderRole})` : "";
                return `${who}${role} ${Number(x.sharePercent)}% = ₹${Number(x.amount).toLocaleString("en-IN")} [${String(prettify(x.status))}]`;
              })
              .join("; ") || null,
        }));
        break;
      }
    }

    return { type, columns: COLUMNS[type], rows, truncated: rows.length >= limit };
  }

  /**
   * Everything a printed report needs around the rows: who the company is, what
   * was asked for, when, and the headline numbers. Shown on screen and used as
   * the letterhead of the Excel and CSV exports, so all three always agree.
   */
  async reportMeta(
    type: RecordType,
    f: RecordFilters,
    result: { columns: RecordColumn[]; rows: Record<string, unknown>[]; truncated: boolean },
    user: AuthUser,
  ) {
    const org = (key: string) => this.settings.get<string>(`org.${key}`) || "";

    const filters: { label: string; value: string }[] = [];
    filters.push({ label: "Period", value: describeRange(resolveRange(f), f.range) });
    if (f.status) filters.push({ label: "Status", value: String(prettify(f.status)) });
    if (f.loanProductId) {
      const p = await this.prisma.loanProduct.findUnique({ where: { id: f.loanProductId }, select: { name: true } });
      filters.push({ label: "Loan type", value: p?.name ?? "Unknown" });
    }
    if (f.q?.trim()) filters.push({ label: "Search", value: f.q.trim() });
    if (user.role === Role.ADVISOR) filters.push({ label: "Scope", value: "Your own records only" });

    const summary: { label: string; value: number; kind: "count" | "amount" }[] = [
      { label: "Total records", value: result.rows.length, kind: "count" },
    ];
    for (const col of result.columns.filter((c) => c.type === "amount")) {
      const total = result.rows.reduce((sum, r) => sum + (typeof r[col.key] === "number" ? (r[col.key] as number) : 0), 0);
      summary.push({ label: `Total — ${col.label}`, value: total, kind: "amount" });
    }
    const tally = new Map<string, number>();
    for (const r of result.rows) {
      const k = String(prettify(r[TALLY_KEY[type]] ?? "—"));
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
    for (const [label, value] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
      summary.push({ label, value, kind: "count" });
    }

    return {
      title: TITLES[type],
      generatedAt: new Date().toISOString(),
      generatedBy: user.name,
      company: {
        name: org("name"),
        legalName: org("legalName"),
        address: org("address"),
        phone: org("phone"),
        email: org("email"),
        gstin: org("gstin"),
        pan: org("pan"),
      },
      filters,
      summary,
      truncated: result.truncated,
    };
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
          ...(created && { updatedAt: created }),
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

    const [appRows, sanctionRows, disbRows] = await this.prisma.$transaction([
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
          ...(created && { updatedAt: created }),
        },
        select: { sanctionedAmount: true, application: { select: { lenderId: true } } },
      }),
      this.prisma.disbursement.findMany({
        where: {
          application: { ...this.appScope(user), lenderId: { not: null } },
          ...(created && { disbursedAt: created }),
        },
        select: { amount: true, application: { select: { lenderId: true } } },
      }),
    ]);

    const apps = new Map(appRows.map((r) => [r.lenderId, countOf(r._count)]));
    const sanctioned = new Map<string, { count: number; amount: number }>();
    for (const s of sanctionRows) {
      const key = s.application.lenderId!;
      const entry = sanctioned.get(key) ?? { count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += Number(s.sanctionedAmount ?? 0);
      sanctioned.set(key, entry);
    }
    const disbursed = new Map<string, number>();
    for (const d of disbRows) {
      const key = d.application.lenderId!;
      disbursed.set(key, (disbursed.get(key) ?? 0) + Number(d.amount));
    }

    return lenders
      .map((l) => ({
        lender: l.name,
        type: l.type,
        applications: apps.get(l.id) ?? 0,
        sanctions: sanctioned.get(l.id)?.count ?? 0,
        sanctionedAmount: sanctioned.get(l.id)?.amount ?? 0,
        disbursedAmount: disbursed.get(l.id) ?? 0,
      }))
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
