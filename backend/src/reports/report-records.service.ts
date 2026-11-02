import { Injectable } from "@nestjs/common";
import { ApplicationStatus, LeadStatus, PayoutStatus, Prisma, Role, SanctionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { SettingsService } from "../settings/settings.service";
import { describeRange, formatIndianNumber, istParts, rangeFilter, resolveRange, ymd } from "../common/date.util";
import {
  canSeeCommission,
  resolveColumns,
  toRecordColumn,
  typeLabel,
  type CatalogueColumn,
  type RecordColumn,
  type RecordType,
} from "./report-catalogue";
import { appFilterWhere, leadFilterWhere, sanctionedInRange, type ReportRange, type SourceFilters } from "./report-scope";

export type RecordFilters = ReportRange &
  SourceFilters & {
    status?: string;
    loanProductId?: string;
    q?: string;
    /** Leads only. */
    segment?: string;
    /** "true" = archived only, "false" = live only, absent = both (reports keep closed files). */
    archived?: string;
    /** Files: "true" keeps only those logged in with a bank. */
    loggedIn?: string;
    /** Files: which date the range applies to — "login" (bank login) or "updated"; default is when the file was created. */
    dateBy?: string;
    /** Leads: "true" keeps only those with a follow-up booked. */
    hasFollowUp?: string;
  };

/** On-screen preview cap. Exports pass `null` and are never cut off. */
export const PREVIEW_LIMIT = 1000;
/** How many records are read from the database at a time, so a huge export never holds one giant query open. */
export const BATCH_SIZE = 500;

const TITLES: Record<RecordType, string> = {
  leads: "Leads Report",
  applications: "Files Report",
  sanctions: "Sanctions Report",
  disbursements: "Disbursals Report",
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

// Values that are acronyms, not enum words: left as written rather than turned into "Rtgs".
const ACRONYMS = new Set(["RTGS", "NEFT", "IMPS", "UPI", "EMI", "NRI", "UTR", "IFSC", "LLP", "PAN", "GST"]);

export const prettify = (v: unknown) =>
  typeof v === "string" && /^[A-Z_]+$/.test(v) && !ACRONYMS.has(v)
    ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ")
    : v;

/** Only the columns being shown, so a report never carries fields nobody asked to see. */
export function pickRows(rows: Record<string, unknown>[], columns: { key: string }[]) {
  return rows.map((row) => Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? null])));
}

/** One payout status for a file with several commissions (one per disbursal). */
export function rollUpPayout(statuses: PayoutStatus[]): PayoutStatus | null {
  if (!statuses.length) return null;
  if (statuses.every((s) => s === PayoutStatus.PAID)) return PayoutStatus.PAID;
  if (statuses.some((s) => s === PayoutStatus.PARTIAL || s === PayoutStatus.PAID)) return PayoutStatus.PARTIAL;
  if (statuses.some((s) => s === PayoutStatus.CLAIMED)) return PayoutStatus.CLAIMED;
  return PayoutStatus.PENDING;
}

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));
const day = (d: Date | null | undefined) => (d ? ymd(istParts(d)) : null);
const joined = (parts: (string | null | undefined)[]) => parts.filter((p): p is string => !!p).join(", ") || null;
const distinct = (parts: (string | null | undefined)[]) => joined([...new Set(parts.filter(Boolean))]);
const sum = (values: (Prisma.Decimal | number | null | undefined)[]) =>
  values.reduce<number>((total, v) => total + (v == null ? 0 : Number(v)), 0);

/**
 * Reads a register a batch at a time (cursor paging on a stable order), so nothing is silently dropped:
 * a `null` limit means every record. With a limit, one extra record is read to know whether more exist.
 */
export async function collect<T extends { id: string }>(
  page: (args: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
  limit: number | null,
  batch = BATCH_SIZE,
): Promise<{ rows: T[]; more: boolean }> {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const want = limit === null ? batch : Math.min(batch, limit + 1 - rows.length);
    if (want <= 0) break;
    const got = await page({ take: want, ...(cursor && { cursor: { id: cursor }, skip: 1 }) });
    rows.push(...got);
    if (got.length < want) break;
    cursor = got[got.length - 1].id;
  }
  if (limit !== null && rows.length > limit) return { rows: rows.slice(0, limit), more: true };
  return { rows, more: false };
}

type Row = Record<string, unknown>;

@Injectable()
export class ReportRecordsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  /**
   * Flat, record-level rows for one register, filtered and scoped to the caller. `columns` is the set the
   * caller will use (it decides which columns are described to the client); rows always carry every key the
   * register can produce so the summary can tally on columns that are not shown.
   */
  async records(type: RecordType, f: RecordFilters, user: AuthUser, limit: number | null = PREVIEW_LIMIT, columnKeys?: string[]) {
    const range = resolveRange(f);
    const created = rangeFilter(range);
    const q = f.q?.trim();
    const withCommission = canSeeCommission(user.role);

    const archivedWhere = (): { archivedAt?: null | { not: null } } =>
      f.archived === "true" ? { archivedAt: { not: null } } : f.archived === "false" ? { archivedAt: null } : {};

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
      ...appFilterWhere(f, user),
      ...(f.loanProductId && { loanProductId: f.loanProductId }),
      ...appSearch(),
    });
    const appLabel = (a: { seq: number; createdAt: Date }) => this.settings.applicationNo(a.seq, a.createdAt);
    const appInclude = {
      loanProduct: { select: { name: true } },
      lender: { select: { name: true } },
      owner: { select: { name: true } },
      lead: { select: { leadNo: true, channel: true, campaign: true, sourcingPartner: { select: { name: true } } } },
      applicants: { where: { isPrimary: true }, take: 1, select: { name: true, phone: true } },
    } satisfies Prisma.ApplicationInclude;
    type AppBits = Prisma.ApplicationGetPayload<{ include: typeof appInclude }>;
    // The columns every register that hangs off a file shares.
    const fileBits = (a: AppBits): Row => ({
      applicationNo: appLabel(a),
      customer: a.applicants[0]?.name ?? null,
      loanType: a.loanProduct.name,
      lender: a.lender?.name ?? null,
      owner: a.owner?.name ?? null,
      source: a.lead?.channel ?? null,
      partner: a.lead?.sourcingPartner?.name ?? null,
    });

    let rows: Row[] = [];
    let more = false;

    switch (type) {
      case "leads": {
        const where: Prisma.LeadWhereInput = {
          ...leadFilterWhere(f, user),
          ...archivedWhere(),
          ...(created && { createdAt: created }),
          ...(f.hasFollowUp === "true" && { followUps: { some: {} } }),
          ...(f.status && { status: f.status as LeadStatus }),
          ...(f.segment && { segment: f.segment as never }),
          ...(f.loanProductId && { loanProductId: f.loanProductId }),
          ...(q && {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }),
        };
        const got = await collect(
          (p) =>
            this.prisma.lead.findMany({
              where,
              include: {
                loanProduct: { select: { name: true } },
                assignedOfficer: { select: { name: true } },
                sourcingPartner: { select: { name: true } },
                _count: { select: { followUps: true } },
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              ...p,
            }),
          limit,
        );
        more = got.more;
        rows = got.rows.map((l) => ({
          leadNo: `L-${l.leadNo}`,
          date: day(l.createdAt),
          status: l.status,
          officer: l.assignedOfficer?.name ?? null,
          segment: l.segment,
          lostReason: l.lostReason,
          customer: l.name,
          phone: l.phone,
          email: l.email,
          city: l.city,
          secondaryPhone: l.secondaryPhone,
          dateOfBirth: day(l.dateOfBirth),
          pan: l.pan,
          address: l.address,
          pincode: l.pincode,
          employmentType: l.employmentType,
          employer: l.employerName,
          monthlyIncome: num(l.monthlyIncome),
          loanType: l.loanProduct?.name ?? null,
          amount: num(l.amount),
          channel: l.channel,
          source: l.source,
          partner: l.sourcingPartner?.name ?? null,
          campaign: l.campaign,
          utmSource: l.utmSource,
          utmMedium: l.utmMedium,
          landingPage: l.landingPage,
          nextFollowUp: day(l.nextFollowUpAt),
          followUpCount: l._count.followUps,
        }));
        break;
      }

      case "applications": {
        const where: Prisma.ApplicationWhereInput = {
          ...appWhere(),
          ...archivedWhere(),
          ...(created && f.dateBy !== "login" && (f.dateBy === "updated" ? { updatedAt: created } : { createdAt: created })),
          ...((f.loggedIn === "true" || f.dateBy === "login") && { bankLoginAt: created && f.dateBy === "login" ? created : { not: null } }),
          ...(f.status && { status: f.status as ApplicationStatus }),
        };
        const got = await collect(
          (p) =>
            this.prisma.application.findMany({
              where,
              include: {
                ...appInclude,
                // Every applicant, the primary first: the co-applicant columns need the rest.
                applicants: { orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
                sanction: true,
                disbursements: { orderBy: [{ disbursedAt: "asc" }, { id: "asc" }] },
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              ...p,
            }),
          limit,
        );
        more = got.more;

        // Commission is a separate read so Staff never even load it.
        const commissions = new Map<string, Prisma.CommissionGetPayload<{ include: { extras: true } }>[]>();
        if (withCommission && got.rows.length) {
          const found = await this.prisma.commission.findMany({
            where: { disbursement: { applicationId: { in: got.rows.map((a) => a.id) } } },
            include: { extras: true, disbursement: { select: { applicationId: true } } },
          });
          for (const c of found) {
            const list = commissions.get(c.disbursement.applicationId) ?? [];
            list.push(c);
            commissions.set(c.disbursement.applicationId, list);
          }
        }

        rows = got.rows.map((a) => {
          const [primary, ...others] = a.applicants;
          const s = a.sanction;
          const paid = a.disbursements;
          const comm = commissions.get(a.id) ?? [];
          const row: Row = {
            applicationNo: appLabel(a),
            date: day(a.createdAt),
            status: a.status,
            owner: a.owner?.name ?? null,
            leadNo: a.lead ? `L-${a.lead.leadNo}` : null,
            source: a.lead?.channel ?? null,
            campaign: a.lead?.campaign ?? null,
            partner: a.lead?.sourcingPartner?.name ?? null,
            updatedAt: day(a.updatedAt),

            customer: primary?.name ?? null,
            phone: primary?.phone ?? null,
            email: primary?.email ?? null,
            dateOfBirth: day(primary?.dateOfBirth),
            pan: primary?.pan ?? null,
            address: primary?.address ?? null,
            city: primary?.city ?? null,
            pincode: primary?.pincode ?? null,
            nri: primary ? (primary.isNRI ? "Yes" : "No") : null,

            employmentType: primary?.employmentType ?? null,
            constitution: primary?.constitution ?? null,
            employer: primary?.employerName ?? null,
            monthlyIncome: num(primary?.monthlyIncome),
            cibilScore: primary?.cibilScore ?? null,
            cibilScoreDate: day(primary?.cibilScoreDate),

            coApplicantCount: others.length,
            coApplicantNames: joined(others.map((o) => o.name)),
            coApplicantRelations: joined(others.map((o) => o.relation)),
            coApplicantPhones: joined(others.map((o) => o.phone)),
            coApplicantPans: joined(others.map((o) => o.pan)),
            coApplicantIncome: others.some((o) => o.monthlyIncome != null) ? sum(others.map((o) => o.monthlyIncome)) : null,

            loanType: a.loanProduct.name,
            lender: a.lender?.name ?? null,
            amount: num(a.requestedAmount),
            tenure: a.tenureMonths,
            purpose: a.purpose,

            loginDate: day(a.bankLoginAt),
            bankReferenceNo: a.bankReferenceNo,
            bankerName: a.bankerName,
            bankerMobile: a.bankerMobile,
            loginFees: num(a.loginFees),
            dsaChannel: a.dsaChannel,

            sanctionNo: s ? this.settings.sanctionNo(s.seq, s.createdAt) : null,
            sanctionDate: day(s?.sanctionDate),
            sanctionedAmount: num(s?.sanctionedAmount),
            sanctionRate: num(s?.interestRate),
            sanctionTenure: s?.tenureMonths ?? null,
            emi: num(s?.emiAmount),
            firstEmiDate: day(s?.firstEmiDate),
            sanctionFee: num(s?.processingFee),
            letterNo: s?.sanctionLetterNo ?? null,
            validTill: day(s?.validTill),
            bankRm: s?.bankRm ?? null,
            technical: s?.technicalStatus ?? null,
            financial: s?.financialStatus ?? null,
            legal: s?.legalStatus ?? null,

            disbursedAmount: paid.length ? sum(paid.map((d) => d.amount)) : null,
            netDisbursed: paid.length ? sum(paid.map((d) => d.netAmount ?? d.amount)) : null,
            disbursalCount: paid.length,
            lastDisbursedOn: day(paid[paid.length - 1]?.disbursedAt),
            disbursalMode: paid.filter((d) => d.mode).pop()?.mode ?? null,
            utrNo: distinct(paid.map((d) => d.utrNo)),
            loanAccountNo: distinct(paid.map((d) => d.loanAccountNo)),
          };
          if (withCommission) {
            const received = comm.filter((c) => c.receivedAmount != null);
            Object.assign(row, {
              commissionAmount: comm.length ? sum(comm.map((c) => c.grossAmount)) : null,
              commissionStatus: rollUpPayout(comm.map((c) => c.status)),
              commissionClaimedOn: day(comm.map((c) => c.claimedAt).filter((d): d is Date => !!d).sort((x, y) => x.getTime() - y.getTime())[0]),
              commissionReceived: received.length ? sum(received.map((c) => c.receivedAmount)) : null,
              commissionReceivedOn: day(comm.map((c) => c.receivedAt).filter((d): d is Date => !!d).sort((x, y) => y.getTime() - x.getTime())[0]),
              commissionExtras: comm.some((c) => c.extras.length) ? sum(comm.flatMap((c) => c.extras.map((x) => x.amount))) : null,
            });
          }
          return row;
        });
        break;
      }

      case "sanctions": {
        const where: Prisma.SanctionWhereInput = {
          AND: [
            sanctionedInRange(range),
            { application: { ...appWhere(), ...archivedWhere() } },
            ...(f.status ? [{ financialStatus: f.status as SanctionStatus }] : []),
          ],
        };
        const got = await collect(
          (p) =>
            this.prisma.sanction.findMany({
              where,
              include: { application: { include: { ...appInclude, disbursements: { select: { amount: true } } } } },
              orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
              ...p,
            }),
          limit,
        );
        more = got.more;
        rows = got.rows.map((s) => {
          const drawn = sum(s.application.disbursements.map((d) => d.amount));
          const sanctioned = Number(s.sanctionedAmount ?? 0);
          return {
            ...fileBits(s.application),
            date: day(s.updatedAt),
            sanctionNo: this.settings.sanctionNo(s.seq, s.createdAt),
            sanctionDate: day(s.sanctionDate),
            amount: num(s.sanctionedAmount),
            rate: num(s.interestRate),
            tenure: s.tenureMonths,
            emi: num(s.emiAmount),
            firstEmiDate: day(s.firstEmiDate),
            processingFee: num(s.processingFee),
            letterNo: s.sanctionLetterNo,
            validTill: day(s.validTill),
            bankRm: s.bankRm,
            technical: s.technicalStatus,
            financial: s.financialStatus,
            legal: s.legalStatus,
            disbursalStatus: drawn <= 0 ? "PENDING" : sanctioned > 0 && drawn < sanctioned ? "PARTIAL" : "DISBURSED",
            disbursedAmount: drawn,
          };
        });
        break;
      }

      case "disbursements": {
        const where: Prisma.DisbursementWhereInput = {
          application: { ...appWhere(), ...archivedWhere() },
          ...(created && { disbursedAt: created }),
          ...(f.status && { type: f.status as never }),
        };
        const got = await collect(
          (p) =>
            this.prisma.disbursement.findMany({
              where,
              include: { application: { include: appInclude } },
              orderBy: [{ disbursedAt: "desc" }, { id: "desc" }],
              ...p,
            }),
          limit,
        );
        more = got.more;
        rows = got.rows.map((d) => ({
          ...fileBits(d.application),
          date: day(d.disbursedAt),
          type: d.type,
          amount: num(d.amount),
          rate: num(d.interestRate),
          roiType: d.roiType,
          loanAccountNo: d.loanAccountNo,
          utrNo: d.utrNo,
          runningBalance: num(d.runningBalance),
          processingFee: num(d.processingFee),
          insurance: num(d.insuranceAmount),
          documentation: num(d.documentationCharges),
          stampDuty: num(d.stampDuty),
          otherDeductions: num(d.otherDeductions),
          netAmount: num(d.netAmount),
          mode: d.mode,
          bankName: d.bankName,
          accountNo: d.accountNo,
          ifsc: d.ifsc,
        }));
        break;
      }

      case "commissions": {
        // Dated by disbursement, like the commission register itself. Never reachable by Staff (the controller refuses).
        const where: Prisma.CommissionWhereInput = {
          disbursement: { application: { ...appWhere(), ...archivedWhere() }, ...(created && { disbursedAt: created }) },
          ...(f.status && { status: f.status as never }),
        };
        const got = await collect(
          (p) =>
            this.prisma.commission.findMany({
              where,
              include: {
                disbursement: { include: { application: { include: appInclude } } },
                extras: true,
                splits: { include: { user: { select: { name: true } }, sourcingPartner: { select: { name: true } } } },
              },
              orderBy: [{ disbursement: { disbursedAt: "desc" } }, { id: "desc" }],
              ...p,
            }),
          limit,
        );
        more = got.more;
        rows = got.rows.map((c) => ({
          ...fileBits(c.disbursement.application),
          date: day(c.disbursement.disbursedAt),
          disbursed: num(c.disbursement.amount),
          rate: num(c.grossRate),
          amount: num(c.grossAmount),
          status: c.status,
          claimedAt: day(c.claimedAt),
          receivedAmount: num(c.receivedAmount),
          receivedAt: day(c.receivedAt),
          receivedRef: c.receivedRef,
          extras:
            c.extras
              .map((x) => `${String(prettify(x.source))} ₹${formatIndianNumber(Number(x.amount))} [${String(prettify(x.status))}]`)
              .join("; ") || null,
          splits:
            c.splits
              .map((x) => {
                const who = x.user?.name ?? x.sourcingPartner?.name ?? "—";
                const role = x.stakeholderRole ? ` (${x.stakeholderRole})` : "";
                return `${who}${role} ${Number(x.sharePercent)}% = ₹${formatIndianNumber(Number(x.amount))} [${String(prettify(x.status))}]`;
              })
              .join("; ") || null,
        }));
        break;
      }
    }

    const columns: CatalogueColumn[] = resolveColumns(type, user.role, columnKeys);
    return { type, columns: columns.map(toRecordColumn), rows, truncated: more };
  }

  /**
   * Everything a printed report needs around the rows: who the company is, what was asked for, when, and the
   * headline numbers. Shown on screen and used as the letterhead of the Excel and CSV exports, so all three agree.
   * Totals are over the columns actually in the report, so a custom export never reveals a figure it does not list.
   */
  async reportMeta(
    type: RecordType,
    f: RecordFilters,
    result: { columns: RecordColumn[]; rows: Row[]; truncated: boolean },
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
    if (f.lenderId) {
      const l = await this.prisma.lender.findUnique({ where: { id: f.lenderId }, select: { name: true } });
      filters.push({ label: "Lender", value: l?.name ?? "Unknown" });
    }
    if (f.channel) filters.push({ label: "Lead source", value: f.channel === "none" ? "No source" : f.channel });
    if (f.partnerId) {
      if (f.partnerId === "none") filters.push({ label: "Sourcing partner", value: "No partner" });
      else {
        const p = await this.prisma.sourcingPartner.findUnique({ where: { id: f.partnerId }, select: { name: true } });
        filters.push({ label: "Sourcing partner", value: p?.name ?? "Unknown" });
      }
    }
    if (f.ownerId) {
      const u = await this.prisma.user.findUnique({ where: { id: f.ownerId }, select: { name: true } });
      filters.push({ label: "Owner", value: u?.name ?? "Unknown" });
    }
    if (f.segment) filters.push({ label: "Segment", value: String(prettify(f.segment)) });
    if (f.archived === "true") filters.push({ label: "Records", value: "Archived only" });
    if (f.q?.trim()) filters.push({ label: "Search", value: f.q.trim() });
    if (user.role === Role.ADVISOR) filters.push({ label: "Scope", value: "Your own records only" });

    const summary: { label: string; value: number; kind: "count" | "amount" }[] = [
      { label: "Total records", value: result.rows.length, kind: "count" },
    ];
    for (const col of result.columns.filter((c) => c.type === "amount")) {
      const total = result.rows.reduce<number>((acc, r) => acc + (typeof r[col.key] === "number" ? (r[col.key] as number) : 0), 0);
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
      title: TITLES[type] ?? `${typeLabel(type)} Report`,
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
}
