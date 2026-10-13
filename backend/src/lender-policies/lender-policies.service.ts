import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { matchAll, type Band, type PolicyRule } from "./policy-matcher";
import type {
  CreatePolicyDto,
  ExceptionDto,
  OutcomeDto,
  PolicyFieldsDto,
  ReviewMatchDto,
  RunMatchDto,
  UpdatePolicyDto,
  VerifyPolicyDto,
} from "./dto/policy.dto";

const DAY = 86_400_000;
const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : d.toNumber());
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

type PolicyRow = Prisma.LenderPolicyGetPayload<{ include: { lender: true; loanProduct: true } }>;

/** How recently the rules were confirmed: OK, DUE (inside the last 15 days of the window), STALE or NEVER. */
export function freshness(p: { lastVerifiedAt: Date | null; reviewEveryDays: number }, now = new Date()) {
  if (!p.lastVerifiedAt) return "NEVER" as const;
  const age = (now.getTime() - p.lastVerifiedAt.getTime()) / DAY;
  if (age > p.reviewEveryDays) return "STALE" as const;
  if (age > p.reviewEveryDays - 15) return "DUE" as const;
  return "OK" as const;
}

/** Bands arrive as loose JSON; keep only well-formed { upTo, value } pairs. */
function cleanBands(raw: unknown[], max: number): Band[] | null {
  const out: Band[] = [];
  for (const b of raw) {
    const o = b as { upTo?: unknown; value?: unknown };
    const value = Number(o?.value);
    const upTo = o?.upTo === null || o?.upTo === undefined || o?.upTo === "" ? null : Number(o.upTo);
    if (!Number.isFinite(value) || value <= 0 || value > max || (upTo !== null && !Number.isFinite(upTo))) {
      throw new BadRequestException(`Each band needs a value between 0 and ${max} and a number (or blank) ceiling`);
    }
    out.push({ upTo, value });
  }
  return out.length ? out : null;
}

export function toRule(p: PolicyRow): PolicyRule {
  return {
    id: p.id,
    lenderId: p.lenderId,
    lenderName: p.lender.name,
    active: p.active && p.lender.active,
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo,
    lastVerifiedAt: p.lastVerifiedAt,
    reviewEveryDays: p.reviewEveryDays,
    minAmount: num(p.minAmount),
    maxAmount: num(p.maxAmount),
    minRate: num(p.minRate),
    maxRate: num(p.maxRate),
    maxTenureMonths: p.maxTenureMonths,
    employmentTypes: p.employmentTypes,
    minAge: p.minAge,
    maxAgeAtApplication: p.maxAgeAtApplication,
    maxAgeAtMaturity: p.maxAgeAtMaturity,
    minMonthlyIncome: num(p.minMonthlyIncome),
    minBusinessVintageMonths: p.minBusinessVintageMonths,
    minAnnualTurnover: num(p.minAnnualTurnover),
    minAnnualProfit: num(p.minAnnualProfit),
    minCreditScore: p.minCreditScore,
    acceptedConstitutions: p.acceptedConstitutions,
    gstRequired: p.gstRequired,
    foirBands: (p.foirBands as Band[] | null) ?? null,
    ltvBands: (p.ltvBands as Band[] | null) ?? null,
    acceptedPropertyTypes: p.acceptedPropertyTypes,
    allIndia: p.allIndia,
    cities: p.cities,
  };
}

@Injectable()
export class LenderPoliciesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── policies ────────────────────────────────────────────────────────────
  async list(query: { lenderId?: string; loanProductId?: string }) {
    const rows = await this.prisma.lenderPolicy.findMany({
      where: {
        ...(query.lenderId && { lenderId: query.lenderId }),
        ...(query.loanProductId && { loanProductId: query.loanProductId }),
      },
      include: {
        lender: { select: { id: true, name: true, active: true } },
        loanProduct: { select: { id: true, name: true, slug: true } },
        _count: { select: { exceptions: true } },
      },
      orderBy: [{ lender: { name: "asc" } }, { loanProduct: { name: "asc" } }],
    });
    return rows.map((p) => ({ ...p, freshness: freshness(p) }));
  }

  async get(id: string) {
    const p = await this.prisma.lenderPolicy.findUnique({
      where: { id },
      include: {
        lender: { select: { id: true, name: true } },
        loanProduct: { select: { id: true, name: true, slug: true } },
        exceptions: { orderBy: { createdAt: "desc" } },
        changes: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });
    if (!p) throw new NotFoundException("Policy not found");
    return { ...p, freshness: freshness(p) };
  }

  private data(dto: PolicyFieldsDto) {
    const { foirBands, ltvBands, effectiveFrom, effectiveTo, ...rest } = dto;
    if (dto.minAmount != null && dto.maxAmount != null && dto.minAmount > dto.maxAmount) {
      throw new BadRequestException("Minimum amount is above the maximum");
    }
    if (dto.minRate != null && dto.maxRate != null && dto.minRate > dto.maxRate) {
      throw new BadRequestException("Minimum rate is above the maximum");
    }
    const bands = (raw: unknown[] | null | undefined, max: number) => {
      if (raw === undefined) return undefined;
      const clean = raw === null ? null : cleanBands(raw, max);
      return clean ? json(clean) : Prisma.DbNull;
    };
    return {
      ...rest,
      ...(foirBands !== undefined && { foirBands: bands(foirBands, 100) }),
      ...(ltvBands !== undefined && { ltvBands: bands(ltvBands, 100) }),
      ...(effectiveFrom && { effectiveFrom: new Date(effectiveFrom) }),
      ...(effectiveTo !== undefined && { effectiveTo: effectiveTo ? new Date(effectiveTo) : null }),
    };
  }

  async create(dto: CreatePolicyDto, actor: AuthUser, ip?: string) {
    const [lender, product] = await Promise.all([
      this.prisma.lender.findUnique({ where: { id: dto.lenderId } }),
      this.prisma.loanProduct.findUnique({ where: { id: dto.loanProductId } }),
    ]);
    if (!lender || !product) throw new NotFoundException("Lender or loan product not found");
    const clash = await this.prisma.lenderPolicy.findUnique({
      where: { lenderId_loanProductId: { lenderId: dto.lenderId, loanProductId: dto.loanProductId } },
    });
    if (clash) throw new ConflictException(`${lender.name} already has a ${product.name} policy; edit that one`);
    const { lenderId, loanProductId, ...fields } = dto;
    const created = await this.prisma.lenderPolicy.create({
      data: { lenderId, loanProductId, ...(this.data(fields) as Omit<Prisma.LenderPolicyUncheckedCreateInput, "lenderId" | "loanProductId">) },
    });
    await this.snapshot(created.id, actor, "Created");
    await this.audit.record({
      actor,
      action: AuditAction.CREATE,
      entity: "LenderPolicy",
      entityId: created.id,
      entityLabel: `${lender.name} · ${product.name}`,
      ip,
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdatePolicyDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.lenderPolicy.findUnique({ where: { id }, include: { lender: true, loanProduct: true } });
    if (!before) throw new NotFoundException("Policy not found");
    const { reason, ...fields } = dto;
    // The rules changed: keep the version being replaced in the history, then move to the next one.
    await this.snapshot(id, actor, reason ?? "Rules edited");
    await this.prisma.lenderPolicy.update({
      where: { id },
      data: { ...(this.data(fields) as Prisma.LenderPolicyUncheckedUpdateInput), version: { increment: 1 } },
    });
    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "LenderPolicy",
      entityId: id,
      entityLabel: `${before.lender.name} · ${before.loanProduct.name}`,
      ip,
    });
    return this.get(id);
  }

  /** "I checked this against the lender's current rules, today." Resets the freshness clock. */
  async verify(id: string, dto: VerifyPolicyDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.lenderPolicy.findUnique({ where: { id }, include: { lender: true, loanProduct: true } });
    if (!before) throw new NotFoundException("Policy not found");
    await this.prisma.lenderPolicy.update({
      where: { id },
      data: {
        lastVerifiedAt: new Date(),
        verifiedById: actor.id,
        verifiedByName: actor.name,
        ...(dto.source && { source: dto.source }),
      },
    });
    await this.snapshot(id, actor, dto.reason ?? "Verified");
    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "LenderPolicy",
      entityId: id,
      entityLabel: `${before.lender.name} · ${before.loanProduct.name} (verified)`,
      ip,
    });
    return this.get(id);
  }

  private async snapshot(policyId: string, actor: AuthUser, reason: string) {
    const p = await this.prisma.lenderPolicy.findUniqueOrThrow({ where: { id: policyId } });
    await this.prisma.lenderPolicyChange.create({
      data: { policyId, version: p.version, snapshot: json(p), changedById: actor.id, changedByName: actor.name, reason },
    });
  }

  // ─── exceptions ──────────────────────────────────────────────────────────
  async addException(policyId: string, dto: ExceptionDto) {
    if (!dto.scenario) throw new BadRequestException("Describe the scenario");
    const policy = await this.prisma.lenderPolicy.findUnique({ where: { id: policyId } });
    if (!policy) throw new NotFoundException("Policy not found");
    const { verifiedNow, scenario, ...rest } = dto;
    return this.prisma.policyException.create({
      data: { policyId, scenario, ...rest, lastVerifiedAt: verifiedNow ? new Date() : null },
    });
  }

  async updateException(id: string, dto: ExceptionDto) {
    const { verifiedNow, ...rest } = dto;
    const found = await this.prisma.policyException.findUnique({ where: { id } });
    if (!found) throw new NotFoundException("Exception not found");
    return this.prisma.policyException.update({
      where: { id },
      data: { ...rest, ...(verifiedNow && { lastVerifiedAt: new Date() }) },
    });
  }

  // ─── matching ────────────────────────────────────────────────────────────
  async runMatch(dto: RunMatchDto, actor: AuthUser) {
    const policies = await this.prisma.lenderPolicy.findMany({
      where: { loanProductId: dto.loanProductId },
      include: { lender: true, loanProduct: true },
    });
    const results = matchAll(dto.profile, policies.map(toRule));
    const exceptions = await this.prisma.policyException.findMany({
      where: { policyId: { in: policies.map((p) => p.id) }, active: true },
      select: { policyId: true, scenario: true, requiredApproval: true, expertNote: true },
    });
    const withNotes = results.map((r) => ({
      ...r,
      // The exact policy version considered, so a result can always be explained later.
      policyVersion: policies.find((p) => p.id === r.policyId)?.version ?? null,
      exceptions: exceptions.filter((e) => e.policyId === r.policyId),
    }));
    const run = await this.prisma.matchRun.create({
      data: {
        leadId: dto.leadId ?? null,
        profile: json({ ...dto.profile, loanProductId: dto.loanProductId }),
        results: json(withNotes),
        createdById: actor.id,
        createdByName: actor.name,
      },
    });
    return { id: run.id, reviewStatus: run.reviewStatus, noPolicies: policies.length === 0, results: withNotes };
  }

  runs(leadId?: string) {
    return this.prisma.matchRun.findMany({ where: leadId ? { leadId } : {}, orderBy: { createdAt: "desc" }, take: 20 });
  }

  /** The customer-display gate: a result may be shown to a customer only after a person approves it. */
  async reviewRun(id: string, dto: ReviewMatchDto, actor: AuthUser) {
    const found = await this.prisma.matchRun.findUnique({ where: { id } });
    if (!found) throw new NotFoundException("Match run not found");
    return this.prisma.matchRun.update({
      where: { id },
      data: {
        reviewStatus: dto.status,
        reviewNote: dto.note ?? null,
        reviewedById: actor.id,
        reviewedByName: actor.name,
        reviewedAt: new Date(),
      },
    });
  }

  // ─── case outcomes ───────────────────────────────────────────────────────
  outcomes(query: { leadId?: string }) {
    return this.prisma.caseOutcome.findMany({
      where: query.leadId ? { leadId: query.leadId } : {},
      orderBy: { createdAt: "desc" },
      take: 300,
    });
  }

  createOutcome(dto: OutcomeDto, actor: AuthUser) {
    return this.prisma.caseOutcome.create({ data: { ...this.outcomeData(dto), createdById: actor.id } });
  }

  async updateOutcome(id: string, dto: OutcomeDto) {
    const found = await this.prisma.caseOutcome.findUnique({ where: { id } });
    if (!found) throw new NotFoundException("Outcome not found");
    return this.prisma.caseOutcome.update({ where: { id }, data: this.outcomeData(dto) });
  }

  private outcomeData(dto: OutcomeDto) {
    const { submittedAt, ...rest } = dto;
    return { ...rest, ...(submittedAt !== undefined && { submittedAt: submittedAt ? new Date(submittedAt) : null }) };
  }

  /** What actually happens to files, per lender and product. */
  async outcomeSummary() {
    const rows = await this.prisma.caseOutcome.findMany({
      select: { lenderId: true, loanProductId: true, outcome: true, turnaroundDays: true },
    });
    const [lenders, products] = await Promise.all([
      this.prisma.lender.findMany({ select: { id: true, name: true } }),
      this.prisma.loanProduct.findMany({ select: { id: true, name: true } }),
    ]);
    const lname = new Map(lenders.map((l) => [l.id, l.name]));
    const pname = new Map(products.map((p) => [p.id, p.name]));
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = `${r.lenderId ?? ""}|${r.loanProductId ?? ""}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.entries()].map(([k, g]) => {
      const [lid, pid] = k.split("|");
      const decided = g.filter((r) => ["SANCTIONED", "DISBURSED", "REJECTED"].includes(r.outcome));
      const good = decided.filter((r) => r.outcome !== "REJECTED").length;
      const tats = g.map((r) => r.turnaroundDays).filter((x): x is number => x !== null);
      return {
        lender: (lid && lname.get(lid)) || "—",
        product: (pid && pname.get(pid)) || "—",
        cases: g.length,
        decided: decided.length,
        sanctionedShare: decided.length ? Math.round((good / decided.length) * 100) : null,
        avgTurnaroundDays: tats.length ? Math.round(tats.reduce((a, b) => a + b, 0) / tats.length) : null,
      };
    });
  }
}
