import { Injectable } from "@nestjs/common";
import { ApplicationStatus, LeadStatus, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { PERIODS, formatDateIST, periodRange, rangeFilter } from "../common/date.util";
import type { ToolSpec } from "./assistant.model";

const MAX_ROWS = 15;
/** Files that are finished or dead — everything else is still being worked. */
const CLOSED: ApplicationStatus[] = [
  ApplicationStatus.DISBURSED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
];

export class ToolRefusal extends Error {}

type Args = Record<string, unknown>;

const text = (v: unknown, max = 100) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const flag = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]) =>
  typeof v === "string" && (allowed as readonly string[]).includes(v.toUpperCase() as T) ? (v.toUpperCase() as T) : undefined;
const limitOf = (v: unknown) => Math.min(Math.max(Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 10, 1), MAX_ROWS);
const num = (v: unknown) => (v == null ? 0 : Number(v));
const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });

/**
 * Read-only questions the assistant may put to the CRM. Every tool applies the
 * same visibility rule as the screens: Staff see only the files and leads
 * assigned to them, and commission economics are Admin and Manager only. The
 * rule lives here, in the code, so it holds whatever the model is asked.
 */
@Injectable()
export class AssistantTools {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  private fileScope(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  private leadScope(user: AuthUser): Prisma.LeadWhereInput {
    return user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {};
  }

  private canSeeMoneyEarned(user: AuthUser) {
    return user.role !== Role.ADVISOR;
  }

  specsFor(user: AuthUser): ToolSpec[] {
    const earned = this.canSeeMoneyEarned(user);
    return [
      {
        type: "function",
        function: {
          name: "count_files",
          description:
            "Count loan files (applications), broken down by stage. 'Active' means not yet disbursed, rejected or withdrawn. Use for 'how many…' questions about files.",
          parameters: {
            type: "object",
            properties: {
              active: { type: "boolean", description: "Only files still being worked" },
              status: { type: "string", enum: Object.values(ApplicationStatus) },
              loanType: { type: "string", description: "Part of a loan type name, e.g. 'home'" },
              lender: { type: "string", description: "Part of a lender name" },
              owner: { type: "string", description: "Part of the name of the staff member handling the file" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "find_files",
          description:
            "List loan files with application number, applicant, loan type, lender, owner, stage, requested / sanctioned / disbursed amounts. Search by applicant name or application number.",
          parameters: {
            type: "object",
            properties: {
              search: { type: "string", description: "Applicant name or application number (e.g. 'Rahul' or 'GCS-2026-0002')" },
              active: { type: "boolean" },
              status: { type: "string", enum: Object.values(ApplicationStatus) },
              loanType: { type: "string" },
              lender: { type: "string" },
              owner: { type: "string" },
              limit: { type: "integer", description: `Up to ${MAX_ROWS}` },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_file",
          description:
            "Full detail of one loan file by application number: applicants, amounts, stage, lender, owner, sanction, disbursements" +
            (earned ? ", who created it and the commission earned" : "") +
            ".",
          parameters: {
            type: "object",
            properties: { applicationNo: { type: "string", description: "e.g. GCS-2026-0002" } },
            required: ["applicationNo"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "find_leads",
          description:
            "Count and list leads (prospects not yet turned into files). Filter by status, source, who they are assigned to, follow-ups due, or when they arrived.",
          parameters: {
            type: "object",
            properties: {
              search: { type: "string", description: "Name or phone" },
              status: { type: "string", enum: Object.values(LeadStatus) },
              source: { type: "string" },
              assignedTo: { type: "string", description: "Part of a staff member's name" },
              followUpDue: { type: "boolean", description: "Only leads whose follow-up date has arrived" },
              arrived: { type: "string", enum: [...PERIODS], description: "When the lead was created" },
              limit: { type: "integer", description: `Up to ${MAX_ROWS}` },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "find_people",
          description:
            "Look a name up everywhere at once. Each result is labelled customer (an applicant or co-applicant on a file), lead, or team_member (staff). Use whenever someone gives a name, so a customer and a colleague with the same name are never mixed up.",
          parameters: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "money_summary",
          description:
            "Totals for a period: how much was sanctioned and disbursed, number of payouts" +
            (earned ? ", and commission earned and received" : "") +
            ". Period is a named range such as 'month', 'last_month', 'quarter', 'fy' (financial year) or 'all'.",
          parameters: {
            type: "object",
            properties: {
              period: { type: "string", enum: [...PERIODS] },
              lender: { type: "string", description: "Part of a lender name" },
            },
          },
        },
      },
    ];
  }

  async run(name: string, rawArgs: unknown, user: AuthUser): Promise<unknown> {
    const args: Args = rawArgs && typeof rawArgs === "object" ? (rawArgs as Args) : {};
    switch (name) {
      case "count_files":
        return this.countFiles(args, user);
      case "find_files":
        return this.findFiles(args, user);
      case "get_file":
        return this.getFile(args, user);
      case "find_leads":
        return this.findLeads(args, user);
      case "find_people":
        return this.findPeople(args, user);
      case "money_summary":
        return this.moneySummary(args, user);
      default:
        throw new ToolRefusal(`There is no tool called ${name}`);
    }
  }

  private fileFilter(args: Args, user: AuthUser): Prisma.ApplicationWhereInput {
    const status = oneOf(args.status, Object.values(ApplicationStatus));
    const loanType = text(args.loanType);
    const lender = text(args.lender);
    const owner = text(args.owner);
    return {
      archivedAt: null,
      ...this.fileScope(user),
      ...(flag(args.active) && { status: { notIn: CLOSED } }),
      // An explicit stage wins over the "active" shorthand.
      ...(status && { status }),
      ...(loanType && { loanProduct: { name: contains(loanType) } }),
      ...(lender && { lender: { name: contains(lender) } }),
      ...(owner && { owner: { name: contains(owner) } }),
    };
  }

  private async countFiles(args: Args, user: AuthUser) {
    const where = this.fileFilter(args, user);
    const rows = await this.prisma.application.groupBy({
      by: ["status"],
      where,
      orderBy: { status: "asc" },
      _count: { _all: true },
    });
    const byStage = Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    return {
      total: rows.reduce((sum, r) => sum + r._count._all, 0),
      byStage,
      note: flag(args.active)
        ? "Active = not disbursed, rejected or withdrawn."
        : "Archived files are not counted.",
    };
  }

  private async findFiles(args: Args, user: AuthUser) {
    const where = this.fileFilter(args, user);
    const search = text(args.search);
    if (search) {
      const seq = Number(search.replace(/^.*-/, ""));
      where.OR = [
        ...(Number.isInteger(seq) && seq > 0 ? [{ seq }] : []),
        { applicants: { some: { name: contains(search) } } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limitOf(args.limit),
        select: {
          seq: true,
          createdAt: true,
          status: true,
          requestedAmount: true,
          loanProduct: { select: { name: true } },
          lender: { select: { name: true } },
          owner: { select: { name: true } },
          applicants: { where: { isPrimary: true }, take: 1, select: { name: true } },
          sanction: { select: { sanctionedAmount: true } },
          disbursements: { select: { amount: true } },
        },
      }),
    ]);
    return {
      total,
      shown: rows.length,
      files: rows.map((a) => ({
        applicationNo: this.settings.applicationNo(a.seq, a.createdAt),
        applicant: a.applicants[0]?.name ?? null,
        loanType: a.loanProduct.name,
        lender: a.lender?.name ?? null,
        handledBy: a.owner?.name ?? null,
        stage: a.status,
        requested: num(a.requestedAmount),
        sanctioned: a.sanction?.sanctionedAmount != null ? num(a.sanction.sanctionedAmount) : null,
        disbursed: a.disbursements.reduce((sum, d) => sum + num(d.amount), 0),
        created: formatDateIST(a.createdAt),
      })),
    };
  }

  private async getFile(args: Args, user: AuthUser) {
    const ref = text(args.applicationNo, 40);
    const seq = ref ? Number(ref.replace(/^.*-/, "")) : NaN;
    if (!Number.isInteger(seq) || seq < 1) throw new ToolRefusal("Give the application number, like GCS-2026-0002");

    const file = await this.prisma.application.findFirst({
      where: { seq, ...this.fileScope(user) },
      select: {
        id: true,
        seq: true,
        createdAt: true,
        status: true,
        archivedAt: true,
        requestedAmount: true,
        tenureMonths: true,
        purpose: true,
        bankLoginAt: true,
        bankReferenceNo: true,
        loanProduct: { select: { name: true } },
        lender: { select: { name: true } },
        owner: { select: { name: true } },
        // Identity numbers (PAN, Aadhaar, date of birth) are never handed to the model.
        applicants: { select: { name: true, isPrimary: true, relation: true, phone: true, employmentType: true } },
        sanction: {
          select: {
            financialStatus: true,
            technicalStatus: true,
            legalStatus: true,
            sanctionedAmount: true,
            interestRate: true,
            tenureMonths: true,
            emiAmount: true,
            sanctionDate: true,
          },
        },
        disbursements: {
          orderBy: { disbursedAt: "asc" },
          select: { amount: true, netAmount: true, disbursedAt: true, utrNo: true },
        },
        _count: { select: { documents: true } },
      },
    });
    // Same answer for "not there" and "not yours": the assistant must not reveal that a file exists.
    if (!file) throw new ToolRefusal("No such file, or it is not assigned to you");

    const out: Record<string, unknown> = {
      applicationNo: this.settings.applicationNo(file.seq, file.createdAt),
      stage: file.status,
      archived: file.archivedAt !== null,
      loanType: file.loanProduct.name,
      lender: file.lender?.name ?? null,
      handledBy: file.owner?.name ?? null,
      created: formatDateIST(file.createdAt),
      requested: num(file.requestedAmount),
      tenureMonths: file.tenureMonths,
      purpose: file.purpose,
      bankLogin: file.bankLoginAt ? formatDateIST(file.bankLoginAt) : null,
      bankReference: file.bankReferenceNo,
      documentsUploaded: file._count.documents,
      applicants: file.applicants.map((a) => ({
        name: a.name,
        role: a.isPrimary ? "applicant" : (a.relation ?? "co-applicant"),
        phone: a.phone,
        employment: a.employmentType,
      })),
      sanction: file.sanction && {
        financial: file.sanction.financialStatus,
        technical: file.sanction.technicalStatus,
        legal: file.sanction.legalStatus,
        amount: file.sanction.sanctionedAmount != null ? num(file.sanction.sanctionedAmount) : null,
        interestRate: file.sanction.interestRate != null ? num(file.sanction.interestRate) : null,
        tenureMonths: file.sanction.tenureMonths,
        emi: file.sanction.emiAmount != null ? num(file.sanction.emiAmount) : null,
        date: file.sanction.sanctionDate ? formatDateIST(file.sanction.sanctionDate) : null,
      },
      disbursements: file.disbursements.map((d) => ({
        amount: num(d.amount),
        net: d.netAmount != null ? num(d.netAmount) : null,
        date: formatDateIST(d.disbursedAt),
        utr: d.utrNo,
      })),
    };

    if (this.canSeeMoneyEarned(user)) {
      const [created, commissions] = await Promise.all([
        this.prisma.auditLog.findFirst({
          where: { entity: "Application", entityId: file.id, action: "CREATE" },
          orderBy: { createdAt: "asc" },
          select: { actorName: true },
        }),
        this.prisma.commission.findMany({
          where: { disbursement: { applicationId: file.id } },
          select: { grossAmount: true, status: true, extras: { select: { amount: true } } },
        }),
      ]);
      out.createdBy = created?.actorName ?? null;
      out.commission = {
        fromLender: commissions.reduce((sum, c) => sum + num(c.grossAmount), 0),
        extras: commissions.reduce((sum, c) => sum + c.extras.reduce((s, e) => s + num(e.amount), 0), 0),
        statuses: commissions.map((c) => c.status),
      };
    }
    return out;
  }

  private async findLeads(args: Args, user: AuthUser) {
    const status = oneOf(args.status, Object.values(LeadStatus));
    const search = text(args.search);
    const source = text(args.source);
    const assignedTo = text(args.assignedTo);
    const arrived = oneOf(args.arrived, PERIODS);
    const created = arrived ? rangeFilter(periodRange(arrived)) : undefined;

    const where: Prisma.LeadWhereInput = {
      archivedAt: null,
      ...this.leadScope(user),
      ...(status && { status }),
      ...(source && { source: contains(source) }),
      ...(assignedTo && { assignedOfficer: { name: contains(assignedTo) } }),
      ...(flag(args.followUpDue) && { nextFollowUpAt: { lte: new Date() }, status: { notIn: [LeadStatus.CONVERTED, LeadStatus.LOST] } }),
      ...(created && { createdAt: created }),
      ...(search && { OR: [{ name: contains(search) }, { phone: { contains: search.replace(/[\s+-]/g, "") } }] }),
    };

    const [total, byStatus, rows] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.groupBy({ by: ["status"], where, orderBy: { status: "asc" }, _count: { _all: true } }),
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limitOf(args.limit),
        select: {
          leadNo: true,
          name: true,
          phone: true,
          status: true,
          source: true,
          amount: true,
          nextFollowUpAt: true,
          createdAt: true,
          loanProduct: { select: { name: true } },
          assignedOfficer: { select: { name: true } },
        },
      }),
    ]);

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      shown: rows.length,
      leads: rows.map((l) => ({
        leadNo: l.leadNo,
        name: l.name,
        phone: l.phone,
        status: l.status,
        source: l.source,
        loanType: l.loanProduct?.name ?? null,
        amount: l.amount != null ? num(l.amount) : null,
        assignedTo: l.assignedOfficer?.name ?? null,
        nextFollowUp: l.nextFollowUpAt ? formatDateIST(l.nextFollowUpAt) : null,
        arrived: formatDateIST(l.createdAt),
      })),
    };
  }

  private async findPeople(args: Args, user: AuthUser) {
    const name = text(args.name);
    if (!name) throw new ToolRefusal("Give a name to look up");

    const [applicants, leads, team] = await Promise.all([
      this.prisma.applicant.findMany({
        where: { name: contains(name), application: this.fileScope(user) },
        take: 8,
        select: {
          name: true,
          isPrimary: true,
          application: {
            select: {
              seq: true,
              createdAt: true,
              status: true,
              requestedAmount: true,
              loanProduct: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.lead.findMany({
        where: { name: contains(name), archivedAt: null, ...this.leadScope(user) },
        take: 8,
        select: { leadNo: true, name: true, status: true, assignedOfficer: { select: { name: true } } },
      }),
      this.prisma.user.findMany({
        where: { name: contains(name), active: true },
        take: 8,
        select: { name: true, designation: true, role: true, email: true },
      }),
    ]);

    const results = [
      ...applicants.map((a) => ({
        kind: "customer",
        name: a.name,
        role: a.isPrimary ? "applicant" : "co-applicant",
        applicationNo: this.settings.applicationNo(a.application.seq, a.application.createdAt),
        loanType: a.application.loanProduct.name,
        stage: a.application.status,
        requested: num(a.application.requestedAmount),
      })),
      ...leads.map((l) => ({
        kind: "lead",
        name: l.name,
        leadNo: l.leadNo,
        status: l.status,
        assignedTo: l.assignedOfficer?.name ?? null,
      })),
      ...team.map((u) => ({
        kind: "team_member",
        name: u.name,
        designation: u.designation,
        // The staff directory is Admin-only elsewhere, so roles and emails stay that way here too.
        ...(user.role === Role.ADMIN && { role: u.role, email: u.email }),
      })),
    ];
    return { matches: results.length, results };
  }

  private async moneySummary(args: Args, user: AuthUser) {
    const period = oneOf(args.period, PERIODS) ?? "month";
    const range = periodRange(period);
    const window = rangeFilter(range);
    const lender = text(args.lender);
    const application: Prisma.ApplicationWhereInput = {
      ...this.fileScope(user),
      ...(lender && { lender: { name: contains(lender) } }),
    };

    const [sanctioned, disbursed] = await Promise.all([
      this.prisma.sanction.aggregate({
        where: {
          financialStatus: "APPROVED",
          application,
          ...(window && { updatedAt: window }),
        },
        _sum: { sanctionedAmount: true },
        _count: { _all: true },
      }),
      this.prisma.disbursement.aggregate({
        where: { application, ...(window && { disbursedAt: window }) },
        _sum: { amount: true, netAmount: true },
        _count: { _all: true },
      }),
    ]);

    const out: Record<string, unknown> = {
      period,
      from: range.from ? formatDateIST(range.from) : "the beginning",
      to: range.to ? formatDateIST(range.to) : "today",
      sanctioned: { files: sanctioned._count._all, amount: num(sanctioned._sum.sanctionedAmount) },
      disbursed: {
        payouts: disbursed._count._all,
        amount: num(disbursed._sum.amount),
        netOfDeductions: num(disbursed._sum.netAmount ?? disbursed._sum.amount),
      },
    };

    if (this.canSeeMoneyEarned(user)) {
      const commissions = await this.prisma.commission.findMany({
        where: { disbursement: { application, ...(window && { disbursedAt: window }) } },
        select: { grossAmount: true, receivedAmount: true, status: true, extras: { select: { amount: true } } },
      });
      out.commission = {
        fromLender: commissions.reduce((sum, c) => sum + num(c.grossAmount), 0),
        extras: commissions.reduce((sum, c) => sum + c.extras.reduce((s, e) => s + num(e.amount), 0), 0),
        // A commission marked paid before receipts were tracked counts in full.
        received: commissions.reduce(
          (sum, c) => sum + (c.receivedAmount != null ? num(c.receivedAmount) : c.status === "PAID" ? num(c.grossAmount) : 0),
          0,
        ),
      };
    }
    return out;
  }
}
