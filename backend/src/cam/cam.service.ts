import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, AuditActorType, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { LenderPoliciesService } from "../lender-policies/lender-policies.service";
import { decryptSecret, encryptSecret } from "../security/secret-box";
import { generateFormToken, hashFormToken, looksLikeFormToken } from "../customer-form/form-token";
import { formatDateTimeIST } from "../common/date.util";
import type { AuthUser } from "../auth/auth.decorators";
import { analyse } from "./cam-analysis";
import { buildCamWorkbook } from "./cam-workbook";
import {
  FAMILIES,
  FAMILY_LABEL,
  familyOfSlug,
  mergePatch,
  missingCore,
  progress,
  sectionsFor,
  type CamData,
  type Family,
} from "./cam-schema";

const DAY_MS = 86_400_000;
/** Best fit first in the lender sheet. */
const RANK: Record<string, number> = { STRONG: 0, POSSIBLE: 1, EXPERT_REVIEW: 2, EXCLUDED: 3 };

const LEAD_SELECT = {
  id: true,
  leadNo: true,
  name: true,
  phone: true,
  secondaryPhone: true,
  email: true,
  city: true,
  source: true,
  amount: true,
  dateOfBirth: true,
  pan: true,
  address: true,
  pincode: true,
  employmentType: true,
  monthlyIncome: true,
  employerName: true,
  designation: true,
  experienceYears: true,
  assignedOfficerId: true,
  loanProductId: true,
  loanProduct: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.LeadSelect;
type LeadRow = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>;

const blank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** What the lead already knows, laid out as CAM answers, so nobody is asked twice. */
export function prefillFromLead(l: LeadRow): CamData {
  const profile = l.employmentType === "SALARIED" ? "Salaried" : l.employmentType === "PROFESSIONAL" ? "Self-employed professional" : l.employmentType === "BUSINESS" || l.employmentType === "SELF_EMPLOYED" ? "Self-employed business" : null;
  const dob = l.dateOfBirth ? l.dateOfBirth.toISOString().slice(0, 10) : null;
  return {
    applicant: { fullName: l.name, mobile: l.phone, altMobile: l.secondaryPhone, email: l.email, city: l.city, pan: l.pan, dob, address: l.address, pincode: l.pincode },
    loanRequest: { amount: l.amount ? Number(l.amount) : null },
    income: {
      profile,
      employer: profile === "Salaried" ? l.employerName : null,
      designation: profile === "Salaried" ? l.designation : null,
      netMonthly: profile === "Salaried" && l.monthlyIncome ? Number(l.monthlyIncome) : null,
      totalExperience: l.experienceYears ? Number(l.experienceYears) : null,
    },
  };
}

/** Stored answers win; the lead's own details fill only what is still blank. */
export function withPrefill(prefill: CamData, stored: CamData): CamData {
  const out: CamData = {};
  for (const id of new Set([...Object.keys(prefill), ...Object.keys(stored)])) {
    if (id === "_meta") { out[id] = stored[id] ?? {}; continue; }
    const merged: Record<string, unknown> = { ...(prefill[id] ?? {}) };
    for (const [k, v] of Object.entries(stored[id] ?? {})) if (!blank(v) || !(k in merged)) merged[k] = v;
    for (const k of Object.keys(merged)) if (blank(merged[k])) delete merged[k];
    out[id] = merged;
  }
  return out;
}

type LinkState = "open" | "submitted" | "expired" | "revoked";

@Injectable()
export class CamService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
    private policies: LenderPoliciesService,
  ) {}

  private company() {
    return { name: this.settings.get<string>("org.name"), phone: this.settings.get<string>("org.phone"), email: this.settings.get<string>("org.email") };
  }

  private async leadFor(id: string, user: AuthUser) {
    const lead = await this.prisma.lead.findFirst({ where: { id, ...(user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {}) }, select: LEAD_SELECT });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  private async caseFor(leadId: string) {
    return (await this.prisma.camCase.findUnique({ where: { leadId } })) ?? (await this.prisma.camCase.create({ data: { leadId } }));
  }

  /** Reading must not create a record for every lead somebody glances at: a lead with no CAM yet reads as an empty one. */
  private async peek(leadId: string) {
    const found = await this.prisma.camCase.findUnique({ where: { leadId } });
    return found ?? { data: {} as Prisma.JsonValue, tokenHash: null, tokenEnc: null, tokenExpiresAt: null, tokenRevokedAt: null, linkCreatedAt: null, customerOpenedAt: null, customerSavedAt: null, customerSubmittedAt: null, updatedAt: new Date(0), updatedByName: null };
  }

  private familyOf(lead: LeadRow, stored: CamData): Family {
    const chosen = String(stored._meta?.family ?? "");
    return (FAMILIES as string[]).includes(chosen) ? (chosen as Family) : familyOfSlug(lead.loanProduct?.slug);
  }

  private linkState(c: { tokenHash: string | null; tokenExpiresAt: Date | null; tokenRevokedAt: Date | null; customerSubmittedAt: Date | null }, now = new Date()): LinkState | null {
    if (!c.tokenHash) return null;
    if (c.tokenRevokedAt) return "revoked";
    if (c.customerSubmittedAt) return "submitted";
    if (c.tokenExpiresAt && c.tokenExpiresAt <= now) return "expired";
    return "open";
  }

  // ── staff side ──────────────────────────────────────────────

  async get(leadId: string, user: AuthUser) {
    const lead = await this.leadFor(leadId, user);
    const c = await this.peek(leadId);
    const stored = (c.data ?? {}) as CamData;
    const family = this.familyOf(lead, stored);
    const data = withPrefill(prefillFromLead(lead), stored);
    const state = this.linkState(c);
    return {
      lead: { id: lead.id, leadNo: lead.leadNo, name: lead.name, phone: lead.phone, productName: lead.loanProduct?.name ?? null },
      family,
      familyLabel: FAMILY_LABEL[family],
      families: FAMILIES.map((f) => ({ value: f, label: FAMILY_LABEL[f] })),
      sections: sectionsFor(family),
      data,
      progress: progress(family, data),
      missing: missingCore(family, data),
      link: {
        state,
        token: state === "open" || state === "submitted" ? (c.tokenEnc ? decryptSecret(c.tokenEnc) : null) : null,
        expiresAt: c.tokenExpiresAt,
        createdAt: c.linkCreatedAt,
        openedAt: c.customerOpenedAt,
        lastSavedAt: c.customerSavedAt,
        submittedAt: c.customerSubmittedAt,
      },
      updatedAt: c.updatedAt,
      updatedByName: c.updatedByName,
    };
  }

  async save(leadId: string, body: unknown, user: AuthUser, ip?: string) {
    const lead = await this.leadFor(leadId, user);
    const c = await this.caseFor(leadId);
    const b = (body && typeof body === "object" ? body : {}) as { family?: unknown; data?: unknown };
    const stored = (c.data ?? {}) as CamData;
    let next = mergePatch(stored, b.data, this.allSections());
    if (typeof b.family === "string" && (FAMILIES as string[]).includes(b.family)) next = { ...next, _meta: { ...(next._meta ?? {}), family: b.family } };
    await this.prisma.camCase.update({ where: { id: c.id }, data: { data: next as Prisma.InputJsonValue, updatedByName: user.name } });
    await this.audit.record({ actor: user, action: AuditAction.UPDATE, entity: "Lead", entityId: lead.id, entityLabel: `${lead.name} · CAM`, ip });
    return this.get(leadId, user);
  }

  /** Every section, for the staff who may touch all of them (the customer is held to the customer sections instead). */
  private allSections() {
    return FAMILIES.flatMap((f) => sectionsFor(f)).filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i);
  }

  async createLink(leadId: string, user: AuthUser, ip?: string) {
    const lead = await this.leadFor(leadId, user);
    if (!/^[6-9]\d{9}$/.test(lead.phone.replace(/\D/g, "").slice(-10))) throw new BadRequestException("Add the customer's mobile number first: the link is meant for that person");
    const c = await this.caseFor(leadId);
    const token = generateFormToken();
    const days = this.settings.get<number>("forms.linkValidDays");
    const now = new Date();
    await this.prisma.camCase.update({
      where: { id: c.id },
      data: { tokenHash: hashFormToken(token), tokenEnc: encryptSecret(token), tokenExpiresAt: new Date(now.getTime() + days * DAY_MS), tokenRevokedAt: null, linkSentById: user.id, linkCreatedAt: now, customerSubmittedAt: null },
    });
    await this.audit.record({ actor: user, action: AuditAction.CREATE, entity: "Lead", entityId: lead.id, entityLabel: `${lead.name} · CAM link`, ip });
    return this.get(leadId, user);
  }

  async revokeLink(leadId: string, user: AuthUser, ip?: string) {
    const lead = await this.leadFor(leadId, user);
    const c = await this.prisma.camCase.findUnique({ where: { leadId } });
    if (c?.tokenHash && !c.tokenRevokedAt) {
      await this.prisma.camCase.update({ where: { id: c.id }, data: { tokenRevokedAt: new Date() } });
      await this.audit.record({ actor: user, action: AuditAction.DELETE, entity: "Lead", entityId: lead.id, entityLabel: `${lead.name} · CAM link withdrawn`, ip });
    }
    return this.get(leadId, user);
  }

  /** The Excel CAM: every sheet, with the numbers worked out and the lenders that may fit. */
  async exportXlsx(leadId: string, user: AuthUser) {
    const lead = await this.leadFor(leadId, user);
    const c = await this.peek(leadId);
    const stored = (c.data ?? {}) as CamData;
    const family = this.familyOf(lead, stored);
    const data = withPrefill(prefillFromLead(lead), stored);
    const analysis = analyse(family, data);

    let match: Awaited<ReturnType<LenderPoliciesService["previewMatch"]>> | null = null;
    let matchNote: string | null = null;
    if (!lead.loanProductId) matchNote = "No loan type is set on this lead, so there is nothing to match against. Set the loan type and download again.";
    else if (!analysis.requested) matchNote = "The loan amount is not known yet, so the lenders cannot be matched. Fill it in and download again.";
    else {
      match = await this.policies.previewMatch(lead.loanProductId, {
        amount: analysis.requested,
        ...(typeof data.applicant?.city === "string" && { city: data.applicant.city }),
        ...(analysis.profile && { employmentType: analysis.profile }),
        ...(analysis.age !== null && { age: analysis.age }),
        ...(analysis.monthlyIncome !== null && { monthlyIncome: analysis.monthlyIncome }),
        existingEmi: analysis.existingEmi,
        ...(analysis.cibil !== null && { creditScore: analysis.cibil }),
        ...(analysis.property.value !== null && { propertyValue: analysis.property.value }),
        ...(typeof data.property?.type === "string" && { propertyType: data.property.type }),
        ...(typeof data.income?.constitution === "string" && { constitution: data.income.constitution }),
        ...(typeof data.income?.vintageYears === "number" && { businessVintageMonths: Math.round(data.income.vintageYears * 12) }),
        ...(analysis.financials[0]?.turnover != null && { annualTurnover: analysis.financials[0].turnover }),
        ...(analysis.financials[0]?.netProfit != null && { annualProfit: analysis.financials[0].netProfit }),
        ...(data.income?.gstRegistered === "Yes" && { gstRegistered: true }),
        tenureMonths: analysis.tenureMonths,
      });
      if (!match.length) matchNote = "No lender rules are recorded for this loan type yet.";
      else match = [...match].sort((x, y) => RANK[x.status] - RANK[y.status] || (y.score ?? -1) - (x.score ?? -1) || x.lenderName.localeCompare(y.lenderName));
    }

    const buffer = await buildCamWorkbook({
      lead: { leadNo: lead.leadNo, name: lead.name, phone: lead.phone, email: lead.email, city: lead.city, productName: lead.loanProduct?.name ?? null, source: lead.source },
      family,
      data,
      analysis,
      match: match?.map((m) => ({ lender: m.lenderName, status: m.status, score: m.score, reasons: m.reasons.map((r) => `${r.ok ? "✓" : "✗"} ${r.text}`).join("\n"), checks: m.checks.join("\n") })) ?? null,
      matchNote,
      company: this.company(),
      generatedBy: user.name,
      generatedAt: formatDateTimeIST(new Date()),
      customerSubmittedAt: c.customerSubmittedAt ? formatDateTimeIST(c.customerSubmittedAt) : null,
    });
    await this.audit.record({ actor: user, action: AuditAction.UPDATE, entity: "Lead", entityId: lead.id, entityLabel: `${lead.name} · CAM downloaded` }).catch(() => undefined);
    const safe = lead.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "customer";
    return { buffer, fileName: `CAM-${lead.leadNo}-${safe}.xlsx` };
  }

  // ── customer side (no login; the link is the credential) ────

  private async loadByToken(token: string) {
    if (!looksLikeFormToken(token)) throw new NotFoundException("This link is not valid.");
    const c = await this.prisma.camCase.findUnique({ where: { tokenHash: hashFormToken(token) }, include: { lead: { select: LEAD_SELECT } } });
    if (!c) throw new NotFoundException("This link is not valid.");
    return c;
  }

  private async openCase(token: string) {
    const c = await this.loadByToken(token);
    const state = this.linkState(c);
    if (state === "submitted") throw new ConflictException("This form has already been sent in. Thank you!");
    if (state !== "open") throw new ConflictException("This link is no longer active. Please ask us for a new one.");
    return c;
  }

  async viewPublic(token: string) {
    const c = await this.loadByToken(token);
    const state = this.linkState(c)!;
    const company = this.company();
    const firstName = c.lead.name.split(/\s+/)[0] ?? c.lead.name;
    if (state !== "open") return { state, company, firstName };
    if (!c.customerOpenedAt) await this.prisma.camCase.update({ where: { id: c.id }, data: { customerOpenedAt: new Date() } });
    const stored = (c.data ?? {}) as CamData;
    const family = this.familyOf(c.lead, stored);
    const data = withPrefill(prefillFromLead(c.lead), stored);
    const secs = sectionsFor(family, true);
    // the customer never receives staff-only answers
    const visibleData: CamData = {};
    for (const s of secs) if (data[s.id]) visibleData[s.id] = data[s.id]!;
    return {
      state: "open" as const,
      company,
      firstName,
      familyLabel: FAMILY_LABEL[family],
      expiresAt: c.tokenExpiresAt,
      sections: secs,
      data: visibleData,
      progress: progress(family, data, true),
      missing: missingCore(family, data, true),
    };
  }

  async savePublic(token: string, body: unknown) {
    const c = await this.openCase(token);
    const stored = (c.data ?? {}) as CamData;
    const family = this.familyOf(c.lead, stored);
    const b = (body && typeof body === "object" ? body : {}) as { data?: unknown };
    const next = mergePatch(stored, b.data, sectionsFor(family, true));
    await this.prisma.camCase.update({ where: { id: c.id }, data: { data: next as Prisma.InputJsonValue, customerSavedAt: new Date() } });
    const data = withPrefill(prefillFromLead(c.lead), next);
    return { ok: true, progress: progress(family, data, true), missing: missingCore(family, data, true) };
  }

  async submitPublic(token: string, body: unknown) {
    const c = await this.openCase(token);
    const stored = (c.data ?? {}) as CamData;
    const family = this.familyOf(c.lead, stored);
    const b = (body && typeof body === "object" ? body : {}) as { data?: unknown };
    const next = b.data !== undefined ? mergePatch(stored, b.data, sectionsFor(family, true)) : stored;
    const data = withPrefill(prefillFromLead(c.lead), next);
    const missing = missingCore(family, data, true);
    if (missing.length) throw new BadRequestException(`Please answer: ${missing.slice(0, 5).map((m) => m.label).join("; ")}${missing.length > 5 ? " and more" : ""}`);
    const now = new Date();
    await this.prisma.camCase.update({ where: { id: c.id }, data: { data: next as Prisma.InputJsonValue, customerSavedAt: now, customerSubmittedAt: now } });
    await this.audit.record({ actor: { id: c.lead.id, name: c.lead.name }, actorType: AuditActorType.CLIENT, action: AuditAction.UPDATE, entity: "Lead", entityId: c.lead.id, entityLabel: `${c.lead.name} · CAM form submitted` });
    return { ok: true };
  }
}
