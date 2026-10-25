import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApplicationStatus, AuditAction, CreditDecision, EmploymentType, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { ChecklistService } from "../checklist/checklist.service";
import type { AuthUser } from "../auth/auth.decorators";
import { bandOf } from "../credit/credit-bands";
import { dscr, emi, foir, loanForEmi, ltv, roomForEmi, variancePercent } from "./credit-calcs";
import { CreditDecisionDto, ExistingLoanDto, UpdateCreditEvaluationDto, UpdateExistingLoanDto } from "./dto/credit-evaluation.dto";

type CheckStatus = "OK" | "WATCH" | "FAIL" | "UNKNOWN";
type Check = { key: string; label: string; status: CheckStatus; detail: string };

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));
const round = (n: number | null, places = 0) => (n === null ? null : Math.round(n * 10 ** places) / 10 ** places);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const INPUTS = ["loanAmount", "proposedRate", "tenureMonths", "monthlyIncome", "annualTurnover", "netProfit", "depreciation", "interestPaid", "avgMonthlyBankCredits", "gstAnnualTurnover", "propertyValue"] as const;

/** How the file's numbers are read: salaried people are judged on income and FOIR, business people also on cover and turnover. */
function profileOf(type: EmploymentType | null | undefined) {
  if (type === "SALARIED") return "SALARIED" as const;
  if (type === "SELF_EMPLOYED" || type === "BUSINESS" || type === "PROFESSIONAL") return "BUSINESS" as const;
  return "OTHER" as const;
}

@Injectable()
export class CreditEvaluationService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
    private checklist: ChecklistService,
  ) {}

  private async file(applicationId: string, user: AuthUser) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, ...(user.role === Role.ADVISOR ? { ownerId: user.id } : {}) },
      include: {
        loanProduct: { select: { name: true, secured: true } },
        applicants: { orderBy: { isPrimary: "desc" } },
        sanction: true,
        existingLoans: { orderBy: { createdAt: "asc" } },
        creditEvaluation: true,
        owner: { select: { name: true } },
        lead: { select: { source: true, sourcingPartner: { select: { name: true } } } },
      },
    });
    if (!app) throw new NotFoundException("Application not found");
    return app;
  }

  private label(app: { seq: number; createdAt: Date }) {
    return this.settings.applicationNo(app.seq, app.createdAt);
  }

  async get(applicationId: string, user: AuthUser) {
    const app = await this.file(applicationId, user);
    const ev = app.creditEvaluation;
    const primary = app.applicants.find((a) => a.isPrimary) ?? app.applicants[0];
    const profile = profileOf(primary?.employmentType);
    const secured = app.loanProduct.secured;

    const t = {
      minDscr: this.settings.get<number>("credit.minDscr"),
      maxFoir: this.settings.get<number>("credit.maxFoirPercent"),
      maxLtv: this.settings.get<number>("credit.maxLtvPercent"),
      variance: this.settings.get<number>("credit.turnoverVariancePercent"),
    };

    // The loan being assessed: what was entered, else what was sanctioned, else what was asked for.
    const amount = num(ev?.loanAmount) ?? num(app.sanction?.sanctionedAmount) ?? num(app.requestedAmount) ?? 0;
    const rate = num(ev?.proposedRate) ?? num(app.sanction?.interestRate);
    const tenure = ev?.tenureMonths ?? app.sanction?.tenureMonths ?? app.tenureMonths ?? null;
    const proposedEmi = rate && tenure ? emi(amount, rate, tenure) : null;

    const counted = app.existingLoans.filter((l) => l.counted);
    const existingEmi = counted.reduce((n, l) => n + Number(l.emi), 0);

    const applicantIncome = app.applicants.reduce((n, a) => n + (num(a.monthlyIncome) ?? 0), 0);
    const profit = num(ev?.netProfit);
    const income =
      num(ev?.monthlyIncome) !== null && num(ev?.monthlyIncome)! > 0
        ? { monthly: num(ev?.monthlyIncome)!, source: "entered" as const }
        : applicantIncome > 0
          ? { monthly: applicantIncome, source: "applicants" as const }
          : profit !== null && profit > 0
            ? { monthly: (profit + (num(ev?.depreciation) ?? 0)) / 12, source: "profit" as const }
            : { monthly: 0, source: null };

    const foirValue = foir(existingEmi, proposedEmi, income.monthly);
    const room = rate && tenure && income.monthly > 0 ? roomForEmi(income.monthly, t.maxFoir, existingEmi) : null;
    const eligible = room !== null && rate && tenure ? loanForEmi(room, rate, tenure) : null;

    const annualDebtService = (existingEmi + (proposedEmi ?? 0)) * 12;
    const dscrValue = profit !== null ? dscr(profit, num(ev?.depreciation) ?? 0, num(ev?.interestPaid) ?? 0, annualDebtService) : null;

    const declared = num(ev?.annualTurnover);
    const bankAnnual = num(ev?.avgMonthlyBankCredits) !== null ? num(ev?.avgMonthlyBankCredits)! * 12 : null;
    const gstAnnual = num(ev?.gstAnnualTurnover);
    const btoVariance = bankAnnual !== null && declared ? variancePercent(bankAnnual, declared) : null;
    const gstVariance = gstAnnual !== null && declared ? variancePercent(gstAnnual, declared) : null;
    const property = num(ev?.propertyValue);
    const ltvValue = secured && property ? ltv(amount, property) : null;

    // ── the checks ──
    const checks: Check[] = [];
    const add = (key: string, label: string, status: CheckStatus, detail: string) => checks.push({ key, label, status, detail });

    add("pan", "PAN", primary?.pan ? "OK" : "FAIL", primary?.pan ? `Recorded for ${primary.name}.` : "Not provided for the main applicant. Lenders will not take the file without it.");

    const band = bandOf(primary?.cibilScore);
    add(
      "cibil",
      "CIBIL score",
      band === null ? "UNKNOWN" : band === "excellent" || band === "good" ? "OK" : band === "fair" ? "WATCH" : "FAIL",
      primary?.cibilScore ? `${primary.cibilScore} for ${primary.name}.` : "No score recorded yet. Add one on the CIBIL page.",
    );

    add(
      "loans",
      "Existing loans",
      app.existingLoans.length ? "OK" : "WATCH",
      app.existingLoans.length ? `${counted.length} counted, ${inr(existingEmi)} a month in EMIs.` : "None recorded. Confirm with the customer that there really are none.",
    );

    add(
      "foir",
      "FOIR",
      foirValue === null ? "UNKNOWN" : foirValue <= t.maxFoir ? "OK" : "FAIL",
      foirValue === null ? "Needs income, an interest rate and a tenure." : `${round(foirValue, 1)}% against a ceiling of ${t.maxFoir}%.`,
    );

    if (profile === "BUSINESS") {
      add(
        "dscr",
        "DSCR",
        dscrValue === null ? "UNKNOWN" : dscrValue >= t.minDscr ? "OK" : "FAIL",
        dscrValue === null ? "Needs net profit, and a rate and tenure for the new EMI." : `${round(dscrValue, 2)} against a floor of ${t.minDscr}.`,
      );
      const mismatch = (label: string, key: string, v: number | null, hint: string) =>
        add(key, label, v === null ? "UNKNOWN" : Math.abs(v) <= t.variance ? "OK" : "WATCH", v === null ? hint : `${round(v, 1)}% from the stated turnover (allowed ±${t.variance}%).`);
      mismatch("Bank turnover (BTO)", "bto", btoVariance, "Needs the stated turnover and the average monthly bank credits.");
      mismatch("GST turnover", "gst", gstVariance, "Needs the stated turnover and the GST turnover.");
    }

    if (secured) {
      add("ltv", "LTV", ltvValue === null ? "UNKNOWN" : ltvValue <= t.maxLtv ? "OK" : "FAIL", ltvValue === null ? "Needs the property value." : `${round(ltvValue, 1)}% against a ceiling of ${t.maxLtv}%.`);
    }

    const docs = await this.checklist.forApplication(applicationId, user).catch(() => null);
    add(
      "documents",
      "Documents",
      !docs || docs.total === 0 ? "UNKNOWN" : docs.given === docs.total ? "OK" : "WATCH",
      !docs || docs.total === 0 ? "No required documents are listed for this loan type." : `${docs.given} of ${docs.total} required documents received.`,
    );

    const count = (s: CheckStatus) => checks.filter((c) => c.status === s).length;

    return {
      application: { id: app.id, applicationNo: this.label(app), status: app.status },
      profile,
      secured,
      loanProduct: app.loanProduct.name,
      applicants: app.applicants.map((a) => ({
        id: a.id,
        name: a.name,
        isPrimary: a.isPrimary,
        pan: a.pan,
        phone: a.phone,
        email: a.email,
        aadhaarLast4: a.aadhaarLast4,
        employmentType: a.employmentType,
        constitution: a.constitution,
        employerName: a.employerName,
        monthlyIncome: num(a.monthlyIncome),
        cibilScore: a.cibilScore,
        cibilScoreDate: a.cibilScoreDate,
      })),
      sourcedBy: app.lead?.sourcingPartner?.name ?? "Self",
      assignedTo: app.owner?.name ?? null,
      purpose: app.purpose,
      createdAt: app.createdAt,
      inputs: Object.fromEntries(INPUTS.map((k) => [k, num(ev?.[k] as Prisma.Decimal | number | null | undefined)])),
      remarks: ev?.remarks ?? null,
      existingLoans: app.existingLoans.map((l) => ({ ...l, outstanding: num(l.outstanding), emi: Number(l.emi) })),
      assessed: { amount, rate, tenure },
      results: {
        proposedEmi: round(proposedEmi),
        existingEmi: round(existingEmi),
        income: { monthly: round(income.monthly), source: income.source },
        foir: { value: round(foirValue, 1), max: t.maxFoir, room: round(room), eligibleAmount: round(eligible) },
        dscr: { value: round(dscrValue, 2), min: t.minDscr, annualDebtService: round(annualDebtService) },
        bto: { annual: round(bankAnnual), declared: round(declared), variancePercent: round(btoVariance, 1) },
        gst: { annual: round(gstAnnual), declared: round(declared), variancePercent: round(gstVariance, 1), allowed: t.variance },
        ltv: { value: round(ltvValue, 1), max: t.maxLtv },
      },
      checks,
      readiness: { ok: count("OK"), watch: count("WATCH"), fail: count("FAIL"), unknown: count("UNKNOWN") },
      decision: ev?.decision ? { decision: ev.decision, note: ev.decisionNote, at: ev.decidedAt, by: ev.decidedByName } : null,
    };
  }

  async update(applicationId: string, dto: UpdateCreditEvaluationDto, user: AuthUser, ip?: string) {
    const app = await this.file(applicationId, user);
    const data: Record<string, unknown> = {};
    for (const k of INPUTS) if (dto[k] !== undefined) data[k] = dto[k];
    if (dto.remarks !== undefined) data.remarks = dto.remarks?.trim() || null;
    const before = app.creditEvaluation ?? {};
    await this.prisma.creditEvaluation.upsert({ where: { applicationId }, create: { applicationId, ...data }, update: data });
    await this.audit.recordUpdate({
      actor: user,
      entity: "CreditEvaluation",
      entityId: applicationId,
      entityLabel: this.label(app),
      changes: diff(before as Record<string, unknown>, data),
      ip,
    });
    return this.get(applicationId, user);
  }

  private async checkApplicant(applicationId: string, applicantId: string | null | undefined) {
    if (!applicantId) return;
    const found = await this.prisma.applicant.count({ where: { id: applicantId, applicationId } });
    if (!found) throw new BadRequestException("That person is not an applicant on this file.");
  }

  async addLoan(applicationId: string, dto: ExistingLoanDto, user: AuthUser, ip?: string) {
    const app = await this.file(applicationId, user);
    await this.checkApplicant(applicationId, dto.applicantId);
    const loan = await this.prisma.existingLoan.create({
      data: { ...dto, applicationId, lenderName: dto.lenderName.trim(), loanType: dto.loanType?.trim() || null, note: dto.note?.trim() || null, applicantId: dto.applicantId || null },
    });
    await this.audit.record({ actor: user, action: AuditAction.CREATE, entity: "ExistingLoan", entityId: loan.id, entityLabel: `${this.label(app)} · ${loan.lenderName}`, ip });
    return this.get(applicationId, user);
  }

  async updateLoan(applicationId: string, loanId: string, dto: UpdateExistingLoanDto, user: AuthUser, ip?: string) {
    const app = await this.file(applicationId, user);
    const before = app.existingLoans.find((l) => l.id === loanId);
    if (!before) throw new NotFoundException("Loan not found on this file");
    await this.checkApplicant(applicationId, dto.applicantId);
    const data = {
      ...dto,
      ...(dto.lenderName !== undefined && { lenderName: dto.lenderName.trim() }),
      ...(dto.loanType !== undefined && { loanType: dto.loanType?.trim() || null }),
      ...(dto.note !== undefined && { note: dto.note?.trim() || null }),
      ...(dto.applicantId !== undefined && { applicantId: dto.applicantId || null }),
    };
    await this.prisma.existingLoan.update({ where: { id: loanId }, data });
    await this.audit.recordUpdate({ actor: user, entity: "ExistingLoan", entityId: loanId, entityLabel: `${this.label(app)} · ${before.lenderName}`, changes: diff(before as unknown as Record<string, unknown>, data as Record<string, unknown>), ip });
    return this.get(applicationId, user);
  }

  async removeLoan(applicationId: string, loanId: string, user: AuthUser, ip?: string) {
    const app = await this.file(applicationId, user);
    const loan = app.existingLoans.find((l) => l.id === loanId);
    if (!loan) throw new NotFoundException("Loan not found on this file");
    await this.prisma.existingLoan.delete({ where: { id: loanId } });
    await this.audit.record({ actor: user, action: AuditAction.DELETE, entity: "ExistingLoan", entityId: loanId, entityLabel: `${this.label(app)} · ${loan.lenderName}`, ip });
    return this.get(applicationId, user);
  }

  /** Clears the file for login, or turns it away. Either moves the file's status and is kept in the audit log. */
  async decide(applicationId: string, dto: CreditDecisionDto, user: AuthUser, ip?: string) {
    const view = await this.get(applicationId, user);
    const app = await this.file(applicationId, user);
    if (app.status === ApplicationStatus.DISBURSED) throw new BadRequestException("This file is already disbursed.");

    if (dto.decision === "REJECTED") {
      if (!dto.note?.trim()) throw new BadRequestException("Say why the file is being rejected.");
    } else {
      if (app.status === ApplicationStatus.REJECTED || app.status === ApplicationStatus.WITHDRAWN) {
        throw new BadRequestException("A rejected or withdrawn file has to be reopened before it can be cleared.");
      }
      const failed = view.checks.filter((c) => c.status === "FAIL");
      if (failed.length && !dto.acknowledgeRisks) {
        throw new BadRequestException(`Still failing: ${failed.map((c) => c.label).join(", ")}. Confirm you want to clear it anyway.`);
      }
    }

    const nextStatus = dto.decision === "REJECTED" ? ApplicationStatus.REJECTED : app.status === ApplicationStatus.DRAFT ? ApplicationStatus.SUBMITTED : app.status;
    await this.prisma.$transaction([
      this.prisma.creditEvaluation.upsert({
        where: { applicationId },
        create: { applicationId, decision: dto.decision as CreditDecision, decisionNote: dto.note?.trim() || null, decidedAt: new Date(), decidedByName: user.name },
        update: { decision: dto.decision as CreditDecision, decisionNote: dto.note?.trim() || null, decidedAt: new Date(), decidedByName: user.name },
      }),
      this.prisma.application.update({ where: { id: applicationId }, data: { status: nextStatus } }),
    ]);
    await this.audit.record({
      actor: user,
      action: AuditAction.UPDATE,
      entity: "Application",
      entityId: applicationId,
      entityLabel: `${this.label(app)} · credit evaluation: ${dto.decision === "READY" ? "ready to login" : "rejected in-house"}`,
      changes: { status: { from: app.status, to: nextStatus }, ...(dto.note?.trim() && { note: { from: null, to: dto.note.trim() } }) },
      ip,
    });
    return this.get(applicationId, user);
  }
}
