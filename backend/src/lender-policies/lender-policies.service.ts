import { cleanConditions, cleanPrograms } from "./policy-extras";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { matchAll, type Band, type PolicyRule, type Profile } from "./policy-matcher";
import { profileFromLead } from "./profile-from-lead";
import { cleanCriteria, coerceValue, fieldKey, missingMandatory, type Criteria, type MatchFieldDef } from "./match-fields";
import { cleanSheet, SHEET_FIELDS } from "./policy-sheet-schema";
import type {
  MatchFieldDto,
  BulkPolicyDto,
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
    programs: cleanPrograms(p.programs),
    criteria: (p.criteria as Criteria | null) ?? null,
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

  private data(dto: PolicyFieldsDto, fields: MatchFieldDef[]) {
    const { foirBands, ltvBands, programs, conditions, criteria, effectiveFrom, effectiveTo, ...rest } = dto;
    if (dto.minAmount != null && dto.maxAmount != null && dto.minAmount > dto.maxAmount) {
      throw new BadRequestException("Minimum amount is above the maximum");
    }
    if (dto.minRate != null && dto.maxRate != null && dto.minRate > dto.maxRate) {
      throw new BadRequestException("Minimum rate is above the maximum");
    }
    if (dto.minTenureMonths != null && dto.maxTenureMonths != null && dto.minTenureMonths > dto.maxTenureMonths) {
      throw new BadRequestException("Minimum tenure is above the maximum");
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
      ...(programs !== undefined && { programs: programs === null || !cleanPrograms(programs).length ? Prisma.DbNull : json(cleanPrograms(programs)) }),
      ...(conditions !== undefined && { conditions: conditions === null || !Object.keys(cleanConditions(conditions)).length ? Prisma.DbNull : json(cleanConditions(conditions)) }),
      ...(criteria !== undefined && { criteria: criteria === null || !Object.keys(cleanCriteria(criteria, fields)).length ? Prisma.DbNull : json(cleanCriteria(criteria, fields)) }),
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
      data: { lenderId, loanProductId, ...(this.data(fields, await this.defs()) as Omit<Prisma.LenderPolicyUncheckedCreateInput, "lenderId" | "loanProductId">) },
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

  /** The same terms for one loan type on many lenders: creates what is missing, reports what already existed. */
  async createMany(dto: BulkPolicyDto, actor: AuthUser, ip?: string) {
    const { lenderIds, loanProductId, maxFoirPercent, ...fields } = dto;
    const ids = [...new Set(lenderIds)];
    const [lenders, product, existing] = await Promise.all([
      this.prisma.lender.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      this.prisma.loanProduct.findUnique({ where: { id: loanProductId }, select: { id: true, name: true } }),
      this.prisma.lenderPolicy.findMany({ where: { loanProductId, lenderId: { in: ids } }, select: { lenderId: true } }),
    ]);
    if (!product) throw new NotFoundException("Loan type not found");
    if (lenders.length !== ids.length) throw new BadRequestException("One of the selected lenders no longer exists.");
    const has = new Set(existing.map((e) => e.lenderId));
    const terms = { ...fields, ...(maxFoirPercent !== undefined && { foirBands: [{ upTo: null, value: maxFoirPercent }] }) };
    const created: string[] = [];
    const skipped: string[] = [];
    for (const lender of lenders) {
      if (has.has(lender.id)) {
        skipped.push(lender.name);
        continue;
      }
      await this.create({ ...terms, lenderId: lender.id, loanProductId }, actor, ip);
      created.push(lender.name);
    }
    return { loanType: product.name, created, skipped };
  }

  async update(id: string, dto: UpdatePolicyDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.lenderPolicy.findUnique({ where: { id }, include: { lender: true, loanProduct: true } });
    if (!before) throw new NotFoundException("Policy not found");
    const { reason, ...fields } = dto;
    // The rules changed: keep the version being replaced in the history, then move to the next one.
    await this.snapshot(id, actor, reason ?? "Rules edited");
    await this.prisma.lenderPolicy.update({
      where: { id },
      data: { ...(this.data(fields, await this.defs()) as Prisma.LenderPolicyUncheckedUpdateInput), version: { increment: 1 } },
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

  /** Verifies a list of policies, one by one so each gets its own history entry and audit line. Unknown ids are skipped. */
  async verifyMany(dto: { ids: string[]; reason?: string }, actor: AuthUser, ip?: string) {
    const ids = [...new Set(dto.ids)];
    const found = await this.prisma.lenderPolicy.findMany({ where: { id: { in: ids } }, select: { id: true } });
    for (const p of found) await this.verify(p.id, { reason: dto.reason ?? "Checked in a bulk review" }, actor, ip);
    return { verified: found.length, skipped: ids.length - found.length };
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

  // ─── match fields ────────────────────────────────────────────────────────
  /** Active and inactive field definitions, in display order. */
  listFields() {
    return this.prisma.matchField.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  }

  /** The definitions in the shape the matcher uses. */
  private async defs(onlyActive = false): Promise<MatchFieldDef[]> {
    const rows = await this.prisma.matchField.findMany({ where: onlyActive ? { active: true } : {}, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return rows.map((r) => ({ key: r.key, label: r.label, type: r.type as MatchFieldDef["type"], options: r.options, unit: r.unit, products: r.products, applicants: r.applicants, mandatory: r.mandatory, minValue: r.minValue, maxValue: r.maxValue, active: r.active }));
  }

  async saveField(id: string | null, dto: MatchFieldDto) {
    const options = [...new Set((dto.options ?? []).map((o) => o.trim()).filter(Boolean))];
    if (dto.type === "CHOICE" && options.length < 2) throw new BadRequestException("A choice field needs at least two options");
    if (dto.minValue != null && dto.maxValue != null && dto.minValue > dto.maxValue) throw new BadRequestException("The lowest allowed value is above the highest");
    const data = {
      label: dto.label.trim(),
      type: dto.type,
      options: dto.type === "CHOICE" ? options : [],
      unit: dto.type === "NUMBER" ? dto.unit?.trim() || null : null,
      hint: dto.hint?.trim() || null,
      answerLabel: dto.answerLabel?.trim() || null,
      products: dto.products ?? [],
      applicants: (dto.applicants ?? []).filter((a) => a === "SALARIED" || a === "SELF_EMPLOYED"),
      mandatory: dto.mandatory ?? false,
      minValue: dto.type === "NUMBER" ? dto.minValue ?? null : null,
      maxValue: dto.type === "NUMBER" ? dto.maxValue ?? null : null,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    if (id) {
      const found = await this.prisma.matchField.findUnique({ where: { id } });
      if (!found) throw new NotFoundException("Field not found");
      // The key and type stay fixed once policies may test them.
      return this.prisma.matchField.update({ where: { id }, data: { ...data, type: found.type, options: found.type === "CHOICE" ? options : [] } });
    }
    const key = fieldKey(dto.key || dto.label);
    if (!key) throw new BadRequestException("The field needs a name");
    if (await this.prisma.matchField.findUnique({ where: { key } })) throw new ConflictException("A field with this name already exists");
    return this.prisma.matchField.create({ data: { ...data, key } });
  }

  /** Deleting a field also drops every policy test on it, so no policy keeps a rule nobody can see. */
  async deleteField(id: string) {
    const f = await this.prisma.matchField.findUnique({ where: { id } });
    if (!f) throw new NotFoundException("Field not found");
    const rows = await this.prisma.lenderPolicy.findMany({ where: { criteria: { not: Prisma.DbNull } }, select: { id: true, criteria: true } });
    for (const r of rows) {
      const c = { ...((r.criteria as Criteria) ?? {}) };
      if (!(f.key in c)) continue;
      delete c[f.key];
      await this.prisma.lenderPolicy.update({ where: { id: r.id }, data: { criteria: Object.keys(c).length ? (c as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
    }
    await this.prisma.matchField.delete({ where: { id } });
    return { ok: true };
  }

  // ─── matching ────────────────────────────────────────────────────────────
  /** What is already known about a lead, as a match profile: its own fields plus what the customer said in the chat or the form. */
  async profileForLead(leadId: string, actor: AuthUser): Promise<Profile> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, ...(actor.role === Role.ADVISOR ? { assignedOfficerId: actor.id } : {}) },
      select: { amount: true, city: true, employmentType: true, monthlyIncome: true, answers: { select: { label: true, value: true }, take: 150 } },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    const profile = profileFromLead(lead);
    const defs = await this.defs(true);
    const values: Record<string, string | number | boolean> = {};
    const rows = await this.prisma.matchField.findMany({ where: { active: true, answerLabel: { not: null } }, select: { key: true, answerLabel: true } });
    for (const r of rows) {
      const def = defs.find((d) => d.key === r.key);
      const hit = lead.answers.find((a) => a.label.trim().toLowerCase() === (r.answerLabel ?? "").trim().toLowerCase());
      const v = def && hit ? coerceValue(def, hit.value) : undefined;
      if (v !== undefined) values[r.key] = v;
    }
    return Object.keys(values).length ? { ...profile, fields: values } : profile;
  }

  async runMatch(dto: RunMatchDto, actor: AuthUser) {
    // What the person typed wins; whatever they left blank is filled from what is known about the lead.
    const typed = Object.fromEntries(Object.entries(dto.profile ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(typeof v === "number" && Number.isNaN(v)))) as Profile;
    const fromLead = dto.leadId ? await this.profileForLead(dto.leadId, actor) : {};
    const product = await this.prisma.loanProduct.findUnique({ where: { id: dto.loanProductId }, select: { slug: true } });
    const profile: Profile = { ...fromLead, ...typed, fields: { ...(fromLead.fields ?? {}), ...(typed.fields ?? {}) }, product: product?.slug };
    const defs = await this.defs(true);
    const policies = await this.prisma.lenderPolicy.findMany({
      where: { loanProductId: dto.loanProductId },
      include: { lender: true, loanProduct: true },
    });
    const results = matchAll(profile, policies.map(toRule), new Date(), defs);
    const exceptions = await this.prisma.policyException.findMany({
      where: { policyId: { in: policies.map((p) => p.id) }, active: true },
      select: { policyId: true, scenario: true, requiredApproval: true, expertNote: true },
    });
    const lenderIds = [...new Set(policies.map((p) => p.lenderId))];
    const [sheets, offers] = await Promise.all([
      this.prisma.lenderPolicySheet.findMany({ where: { lenderId: { in: lenderIds } }, select: { lenderId: true, data: true } }),
      this.prisma.lenderOffer.findMany({ where: { appliedLenderId: { in: lenderIds }, status: "APPLIED" }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, appliedLenderId: true, fileName: true, createdAt: true, objectKey: true } }),
    ]);
    const withNotes = results.map((r) => {
      const p = policies.find((x) => x.id === r.policyId);
      const sheet = cleanSheet(sheets.find((s) => s.lenderId === p?.lenderId)?.data);
      const offer = offers.find((o) => o.appliedLenderId === p?.lenderId);
      return {
        ...r,
        // The exact policy version considered, so a result can always be explained later.
        policyVersion: p?.version ?? null,
        exceptions: exceptions.filter((e) => e.policyId === r.policyId),
        // What a person should read beside the score: the policy's own notes, its one-pager, and the flyer they came from.
        // The matcher itself only weighs the numbers; none of this text is scored or read by an AI.
        details: {
          notes: p?.notes ?? null,
          specialScheme: p?.specialScheme ?? null,
          source: p?.source ?? null,
          sheet: SHEET_FIELDS.filter((f) => sheet[f.key] !== undefined).map((f) => ({ label: f.label, value: Array.isArray(sheet[f.key]) ? (sheet[f.key] as string[]).join(", ") : String(sheet[f.key]) })),
          flyer: offer ? { id: offer.id, name: offer.fileName ?? "Pasted message", date: offer.createdAt, hasFile: Boolean(offer.objectKey) } : null,
        },
      };
    });
    const run = await this.prisma.matchRun.create({
      data: {
        leadId: dto.leadId ?? null,
        profile: json({ ...profile, loanProductId: dto.loanProductId }),
        results: json(withNotes),
        createdById: actor.id,
        createdByName: actor.name,
      },
    });
    return { id: run.id, reviewStatus: run.reviewStatus, noPolicies: policies.length === 0, results: withNotes, missingFields: missingMandatory(defs, profile.fields, { product: profile.product, employmentType: profile.employmentType }).map((f) => ({ key: f.key, label: f.label })) };
  }

  /** The same matching as runMatch, without saving a run: for a report that only needs to show the shortlist. */
  async previewMatch(loanProductId: string, profile: Profile) {
    const policies = await this.prisma.lenderPolicy.findMany({ where: { loanProductId }, include: { lender: true, loanProduct: true } });
    return matchAll(profile, policies.map(toRule), new Date(), await this.defs(true));
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
