import { Injectable } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { SETTINGS } from "../settings/settings.registry";
import type { AuthUser } from "../auth/auth.decorators";

export type Match = { label: string; value: string; section?: string };

export type SearchHit = {
  id: string;
  title: string;
  subtitle: string;
  /** Breadcrumb for "where is this": e.g. "Applications › GCS-2026-0002 › Disbursements". */
  where: string;
  path: string;
  hash?: string;
  matches: Match[];
};

export type SearchGroup = {
  type: string;
  label: string;
  total: number;
  hits: SearchHit[];
};

type Candidate = Match & { weight?: number };

const MAX_INT = 2_000_000_000;

const PAGES: { label: string; path: string; hash?: string; roles?: Role[]; keywords: string }[] = [
  { label: "Dashboard", path: "/", keywords: "home overview summary performance metrics loan distribution conversion export report today check in punch" },
  { label: "Leads", path: "/leads", keywords: "prospects enquiries new lead import bulk csv upload export follow-up lost reason source" },
  { label: "Applications", path: "/applications", keywords: "login files cases application form login status bank login new application applicant co-applicant" },
  { label: "Sanctions", path: "/sanctions", keywords: "sanctioned loans technical financial legal evaluation approval sanction letter" },
  { label: "Disbursements", path: "/disbursements", keywords: "payout disbursed utr loan account processing fee roi insurance part disbursement" },
  { label: "Commissions", path: "/commissions", roles: [Role.ADMIN, Role.MANAGER], keywords: "commission ledger payout split stakeholder partner share earnings" },
  { label: "Banks & NBFCs", path: "/settings", hash: "lenders", roles: [Role.ADMIN], keywords: "lender directory banks nbfc lenders bank master partner banks masters" },
  { label: "Lender Directory", path: "/lenders", roles: [Role.MANAGER, Role.ADVISOR], keywords: "banks nbfc lenders bank master partner banks" },
  { label: "Sourcing Partners", path: "/partners", roles: [Role.ADMIN, Role.MANAGER], keywords: "bsa dsa referrers partner portal password commission rate" },
  { label: "Team", path: "/team", roles: [Role.ADMIN], keywords: "staff employees users roles hierarchy reports to add staff reset password" },
  { label: "Attendance & Payroll", path: "/attendance", roles: [Role.ADMIN, Role.MANAGER], keywords: "attendance payroll salary leave holiday half day check in check out present absent" },
  { label: "Marketing", path: "/marketing", roles: [Role.ADMIN, Role.MANAGER], keywords: "campaign channel spend cost per lead cpl qualified roas google ads meta facebook instagram utm tracking link landing page agency advertising hoardings roadshow activation lead sources marketing" },
  { label: "Reports", path: "/reports", keywords: "analytics export excel csv print pdf funnel lead sources loan mix officers stalled cases report builder records" },
  { label: "Audit log", path: "/audit", roles: [Role.ADMIN], keywords: "history changes who did what activity trail log" },
  { label: "Settings", path: "/settings", roles: [Role.ADMIN], keywords: "configuration organisation numbering financial year security password policy categories" },
];

const SETTINGS_TABS: { label: string; hash: string; keywords: string }[] = [
  { label: "Loan products", hash: "products", keywords: "loan types products master list" },
  { label: "Document checklist", hash: "checklist", keywords: "documents required checklist kyc per product" },
  { label: "Commission rate cards", hash: "ratecards", keywords: "rate card commission structure partner earning" },
];

const APP_SECTIONS: Record<string, { label: string; hash: string }> = {
  applicants: { label: "Applicants", hash: "applicants" },
  references: { label: "References", hash: "references" },
  login: { label: "Bank login", hash: "login" },
  portal: { label: "Borrower portal access", hash: "portal" },
  sanction: { label: "Sanction", hash: "sanction" },
  disbursement: { label: "Disbursements", hash: "disbursement" },
  documents: { label: "Documents", hash: "documents" },
};

const digits = (s: string) => s.replace(/\D/g, "");

/** Does `value` contain `token`? Phone-like tokens also match regardless of spaces, dashes or +91. */
export function contains(value: string, token: string) {
  const v = value.toLowerCase();
  const t = token.toLowerCase();
  if (v.includes(t)) return true;
  const td = digits(token);
  return td.length >= 4 && td.length === token.replace(/[\s+\-()]/g, "").length && digits(value).includes(td);
}

export function score(cands: Candidate[], tokens: string[]) {
  let best = 0;
  for (const c of cands) {
    const v = c.value.toLowerCase();
    for (const t of tokens.map((x) => x.toLowerCase())) {
      if (v === t) best = Math.max(best, 3);
      else if (v.startsWith(t)) best = Math.max(best, 2);
      else if (v.includes(t)) best = Math.max(best, 1);
    }
  }
  return best;
}

/** Best name matches first (exact, then prefix, then contains), stable otherwise. */
export function rankByName<T>(rows: T[], name: (r: T) => string, tokens: string[]) {
  return rows
    .map((r, i) => ({ r, i, s: score([{ label: "", value: name(r) }], tokens) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

export function pickMatches(cands: Candidate[], tokens: string[]): Match[] {
  const out: Match[] = [];
  for (const token of tokens) {
    const c = cands.find((x) => x.value && contains(x.value, token));
    if (c && !out.some((m) => m.label === c.label && m.value === c.value)) {
      out.push({ label: c.label, value: c.value, section: c.section });
    }
    if (out.length >= 2) break;
  }
  return out;
}

@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async search(raw: string, limit: number, user: AuthUser) {
    const q = raw.trim().slice(0, 100);
    // A phone number typed with spaces, dashes or +91 is one token, not several.
    const compact = q.replace(/[\s+\-()]/g, "");
    const tokens = /^\d{7,15}$/.test(compact)
      ? [compact.length > 10 && compact.startsWith("91") ? compact.slice(-10) : compact.replace(/^0(?=\d{10}$)/, "")]
      : q.split(/\s+/).filter(Boolean).slice(0, 6);
    if (!tokens.length) return { query: q, groups: [] as SearchGroup[], total: 0 };

    const isAdvisor = user.role === Role.ADVISOR;
    const admin = user.role === Role.ADMIN;
    const manager = user.role === Role.ADMIN || user.role === Role.MANAGER;

    const groups = (
      await Promise.all([
        this.applications(tokens, limit, isAdvisor ? user.id : null),
        this.leads(tokens, limit, isAdvisor ? user.id : null),
        this.lenders(tokens, limit, admin),
        this.lenderContacts(tokens, limit, admin),
        manager ? this.partners(tokens, limit) : null,
        admin ? this.team(tokens, limit) : null,
        this.products(tokens, limit, admin),
        this.pages(tokens, limit, user.role),
        admin ? this.audit(tokens, limit) : null,
      ])
    ).filter((g): g is SearchGroup => !!g && g.hits.length > 0);

    return { query: q, groups, total: groups.reduce((n, g) => n + g.total, 0) };
  }

  // ── helpers ───────────────────────────────────────────────

  /** AND across tokens, OR across fields: "sneha bajaj" finds the file with both words anywhere. */
  private allTokens<T>(tokens: string[], perToken: (t: string) => T[]): { AND: { OR: T[] }[] } {
    return { AND: tokens.map((t) => ({ OR: perToken(t) })) };
  }

  private seqOf(token: string): number | null {
    // "GCS-2026-0042", "0042", "42" all mean sequence 42; ignore anything that could overflow an Int.
    if (!/^([A-Za-z]+-)?[\d-]+$/.test(token) || !/\d/.test(token) || /^l-/i.test(token)) return null;
    const n = Number(token.replace(/^.*-/, ""));
    return Number.isInteger(n) && n > 0 && n < MAX_INT ? n : null;
  }

  private has = (field: string, t: string) => ({ [field]: { contains: t, mode: "insensitive" as const } });

  // ── applications ──────────────────────────────────────────

  private async applications(tokens: string[], limit: number, ownerId: string | null): Promise<SearchGroup> {
    const has = this.has;
    const where: Prisma.ApplicationWhereInput = {
      ...(ownerId && { ownerId }),
      ...this.allTokens<Prisma.ApplicationWhereInput>(tokens, (t) => {
        const seq = this.seqOf(t);
        return [
          ...(seq ? [{ seq }] : []),
          has("bankReferenceNo", t),
          has("bankerName", t),
          has("bankerMobile", t),
          has("dsaChannel", t),
          has("purpose", t),
          { portalAccessCode: { equals: t, mode: "insensitive" } },
          { lender: has("name", t) },
          { loanProduct: has("name", t) },
          { owner: has("name", t) },
          { applicants: { some: { OR: [has("name", t), has("phone", t), has("email", t), has("pan", t), has("city", t), has("employerName", t)] } } },
          { references: { some: { OR: [has("name", t), has("phone", t)] } } },
          { sanction: has("sanctionLetterNo", t) },
          { disbursements: { some: { OR: [has("loanAccountNo", t), has("utrNo", t)] } } },
          { documents: { some: has("fileName", t) } },
        ];
      }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit * 3,
        include: {
          lender: { select: { name: true } },
          loanProduct: { select: { name: true } },
          owner: { select: { name: true } },
          applicants: { select: { name: true, phone: true, email: true, pan: true, city: true, employerName: true, isPrimary: true } },
          references: { select: { name: true, phone: true } },
          sanction: { select: { sanctionLetterNo: true } },
          disbursements: { select: { loanAccountNo: true, utrNo: true } },
          documents: { select: { fileName: true } },
        },
      }),
      this.prisma.application.count({ where }),
    ]);

    const hits = rows
      .map((a) => {
        const no = this.settings.applicationNo(a.seq, a.createdAt);
        const primary = a.applicants.find((x) => x.isPrimary) ?? a.applicants[0];
        const cands: Candidate[] = [
          { label: "Application no.", value: no },
          ...a.applicants.flatMap((p): Candidate[] => [
            { label: p.isPrimary ? "Applicant" : "Co-applicant", value: p.name, section: "applicants" },
            { label: "Phone", value: p.phone ?? "", section: "applicants" },
            { label: "Email", value: p.email ?? "", section: "applicants" },
            { label: "PAN", value: p.pan ?? "", section: "applicants" },
            { label: "City", value: p.city ?? "", section: "applicants" },
            { label: "Employer", value: p.employerName ?? "", section: "applicants" },
          ]),
          { label: "Bank reference", value: a.bankReferenceNo ?? "", section: "login" },
          { label: "Banker", value: a.bankerName ?? "", section: "login" },
          { label: "Banker mobile", value: a.bankerMobile ?? "", section: "login" },
          { label: "DSA channel", value: a.dsaChannel ?? "", section: "login" },
          { label: "Borrower access code", value: a.portalAccessCode ?? "", section: "portal" },
          { label: "Sanction letter", value: a.sanction?.sanctionLetterNo ?? "", section: "sanction" },
          ...a.disbursements.flatMap((d): Candidate[] => [
            { label: "UTR", value: d.utrNo ?? "", section: "disbursement" },
            { label: "Loan account", value: d.loanAccountNo ?? "", section: "disbursement" },
          ]),
          ...a.references.flatMap((r): Candidate[] => [
            { label: "Reference", value: r.name, section: "references" },
            { label: "Reference phone", value: r.phone, section: "references" },
          ]),
          ...a.documents.map((d): Candidate => ({ label: "Document", value: d.fileName, section: "documents" })),
          { label: "Lender", value: a.lender?.name ?? "" },
          { label: "Loan type", value: a.loanProduct.name },
          { label: "Owner", value: a.owner?.name ?? "" },
          { label: "Purpose", value: a.purpose ?? "" },
        ];
        const seqTokens = tokens.filter((t) => this.seqOf(t) === a.seq);
        const matches = pickMatches(cands, seqTokens.length ? [...seqTokens, ...tokens] : tokens);
        const first = matches.find((m) => m.section);
        const sec = first?.section ? APP_SECTIONS[first.section] : undefined;
        return {
          rank: score(cands, tokens) + (seqTokens.length ? 3 : 0),
          hit: {
            id: a.id,
            title: primary?.name ? `${primary.name}` : no,
            subtitle: `${no} · ${a.loanProduct.name}${a.lender ? ` · ${a.lender.name}` : ""} · ${a.status.replace(/_/g, " ").toLowerCase()}${a.archivedAt ? " · archived" : ""}`,
            where: `Applications › ${no}${sec ? ` › ${sec.label}` : ""}`,
            path: `/applications/${a.id}`,
            hash: sec?.hash,
            matches,
          } satisfies SearchHit,
        };
      })
      .sort((x, y) => y.rank - x.rank)
      .slice(0, limit)
      .map((x) => x.hit);

    return { type: "applications", label: "Applications", total, hits };
  }

  // ── leads ─────────────────────────────────────────────────

  private async leads(tokens: string[], limit: number, officerId: string | null): Promise<SearchGroup> {
    const has = this.has;
    const where: Prisma.LeadWhereInput = {
      ...(officerId && { assignedOfficerId: officerId }),
      ...this.allTokens<Prisma.LeadWhereInput>(tokens, (t) => {
        const no = /^(L-?)?(\d+)$/i.exec(t);
        const leadNo = no ? Number(no[2]) : null;
        return [
          ...(leadNo && leadNo < MAX_INT ? [{ leadNo }] : []),
          has("name", t),
          has("phone", t),
          has("email", t),
          has("city", t),
          has("source", t),
          has("notes", t),
          has("lostReason", t),
          has("meetingPlace", t),
          { loanProduct: has("name", t) },
          { sourcingPartner: has("name", t) },
          { assignedOfficer: has("name", t) },
          { followUps: { some: has("note", t) } },
        ];
      }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit * 3,
        include: {
          loanProduct: { select: { name: true } },
          sourcingPartner: { select: { name: true } },
          assignedOfficer: { select: { name: true } },
          followUps: { select: { note: true } },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    const hits = rows
      .map((l) => {
        const cands: Candidate[] = [
          { label: "Lead no.", value: `L-${l.leadNo}` },
          { label: "Name", value: l.name },
          { label: "Phone", value: l.phone },
          { label: "Email", value: l.email ?? "" },
          { label: "City", value: l.city ?? "" },
          { label: "Source", value: l.source },
          { label: "Loan type", value: l.loanProduct?.name ?? "" },
          { label: "Partner", value: l.sourcingPartner?.name ?? "" },
          { label: "Assigned to", value: l.assignedOfficer?.name ?? "" },
          { label: "Lost reason", value: l.lostReason ?? "" },
          { label: "Notes", value: l.notes ?? "" },
          { label: "Meeting place", value: l.meetingPlace ?? "" },
          ...l.followUps.map((f): Candidate => ({ label: "Follow-up note", value: f.note, section: "followups" })),
        ];
        const followUp = pickMatches(cands, tokens).find((m) => m.section === "followups");
        return {
          rank: score(cands, tokens),
          hit: {
            id: l.id,
            title: l.name,
            subtitle: `L-${l.leadNo} · ${l.phone}${l.loanProduct ? ` · ${l.loanProduct.name}` : ""} · ${l.status.replace(/_/g, " ").toLowerCase()}${l.archivedAt ? " · archived" : ""}`,
            where: `Leads › ${l.name}${followUp ? " › Follow-ups" : ""}`,
            path: `/leads/${l.id}`,
            hash: followUp ? "followups" : undefined,
            matches: pickMatches(cands, tokens),
          } satisfies SearchHit,
        };
      })
      .sort((x, y) => y.rank - x.rank)
      .slice(0, limit)
      .map((x) => x.hit);

    return { type: "leads", label: "Leads", total, hits };
  }

  // ── directories ───────────────────────────────────────────

  private async lenders(tokens: string[], limit: number, admin: boolean): Promise<SearchGroup> {
    // Typing "bank" or "nbfc" lists that kind of lender, as well as matching names.
    const where: Prisma.LenderWhereInput = this.allTokens<Prisma.LenderWhereInput>(tokens, (t) => [
      this.has("name", t),
      ...(/^bank$/i.test(t) ? [{ type: "BANK" as const }] : /^nbfc$/i.test(t) ? [{ type: "NBFC" as const }] : []),
    ]);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lender.findMany({ where, orderBy: { name: "asc" }, take: limit * 3 }),
      this.prisma.lender.count({ where }),
    ]);
    return {
      type: "lenders",
      label: "Lenders",
      total,
      hits: rankByName(rows, (l) => l.name, tokens).slice(0, limit).map((l) => ({
        id: l.id,
        title: l.name,
        subtitle: `${l.type === "BANK" ? "Bank" : "NBFC"}${l.active ? "" : " · inactive"}`,
        where: admin ? "Settings › Banks & NBFCs" : "Lender Directory",
        path: admin ? "/settings" : "/lenders",
        hash: `lender-${l.id}`,
        matches: pickMatches([{ label: "Lender", value: l.name }, { label: "Type", value: l.type }], tokens),
      })),
    };
  }

  /** The people at banks and NBFCs — found by name, number, email, their lender or loan type. */
  private async lenderContacts(tokens: string[], limit: number, admin: boolean): Promise<SearchGroup> {
    const where: Prisma.LenderContactWhereInput = {
      active: true,
      ...this.allTokens<Prisma.LenderContactWhereInput>(tokens, (t) => [
        this.has("name", t),
        this.has("phone", t),
        this.has("email", t),
        this.has("designation", t),
        { lender: this.has("name", t) },
        { segments: { has: t } },
      ]),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lenderContact.findMany({ where, include: { lender: { select: { id: true, name: true } } }, orderBy: { name: "asc" }, take: limit * 3 }),
      this.prisma.lenderContact.count({ where }),
    ]);
    return {
      type: "lenderContacts",
      label: "Bank & NBFC contacts",
      total,
      hits: rankByName(rows, (c) => c.name, tokens).slice(0, limit).map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: [c.designation, c.lender.name, c.phone].filter(Boolean).join(" · "),
        where: `${admin ? "Settings › Banks & NBFCs" : "Lender Directory"} › ${c.lender.name} › Contacts`,
        path: admin ? "/settings" : "/lenders",
        hash: `lender-${c.lender.id}`,
        matches: pickMatches(
          [
            { label: "Name", value: c.name },
            { label: "Phone", value: c.phone ?? "" },
            { label: "Email", value: c.email ?? "" },
            { label: "Lender", value: c.lender.name },
            { label: "Loan types", value: c.segments.join(", ") },
          ],
          tokens,
        ),
      })),
    };
  }

  private async partners(tokens: string[], limit: number): Promise<SearchGroup> {
    const has = this.has;
    const where: Prisma.SourcingPartnerWhereInput = this.allTokens(tokens, (t) => [
      has("name", t),
      has("firm", t),
      has("phone", t),
      has("email", t),
      has("city", t),
      has("code", t),
      { manager: has("name", t) },
    ]);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sourcingPartner.findMany({ where, orderBy: { name: "asc" }, take: limit * 3, include: { manager: { select: { name: true } } } }),
      this.prisma.sourcingPartner.count({ where }),
    ]);
    return {
      type: "partners",
      label: "Sourcing partners",
      total,
      hits: rankByName(rows, (p) => p.name, tokens).slice(0, limit).map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: `${p.code ?? ""} · ${p.phone}${p.firm ? ` · ${p.firm}` : ""}`.replace(/^ · /, ""),
        where: "Sourcing Partners",
        path: "/partners",
        hash: `row-${p.id}`,
        matches: pickMatches(
          [
            { label: "Partner", value: p.name },
            { label: "Code", value: p.code ?? "" },
            { label: "Phone", value: p.phone },
            { label: "Email", value: p.email ?? "" },
            { label: "Firm", value: p.firm ?? "" },
            { label: "City", value: p.city ?? "" },
            { label: "Reports to", value: p.manager?.name ?? "" },
          ],
          tokens,
        ),
      })),
    };
  }

  private async team(tokens: string[], limit: number): Promise<SearchGroup> {
    const has = this.has;
    const where: Prisma.UserWhereInput = this.allTokens(tokens, (t) => [
      has("name", t),
      has("email", t),
      has("phone", t),
      has("designation", t),
      has("employeeCode", t),
    ]);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: { name: "asc" }, take: limit * 3 }),
      this.prisma.user.count({ where }),
    ]);
    return {
      type: "team",
      label: "Team",
      total,
      hits: rankByName(rows, (u) => u.name, tokens).slice(0, limit).map((u) => ({
        id: u.id,
        title: u.name,
        subtitle: `${u.employeeCode ?? ""} · ${u.designation ?? u.role}`.replace(/^ · /, ""),
        where: "Team",
        path: "/team",
        hash: `row-${u.id}`,
        matches: pickMatches(
          [
            { label: "Name", value: u.name },
            { label: "Email", value: u.email },
            { label: "Phone", value: u.phone ?? "" },
            { label: "Designation", value: u.designation ?? "" },
            { label: "Employee code", value: u.employeeCode ?? "" },
          ],
          tokens,
        ),
      })),
    };
  }

  // ── products, checklist, rate cards (settings) ────────────

  private async products(tokens: string[], limit: number, admin: boolean): Promise<SearchGroup> {
    const has = this.has;
    const products = await this.prisma.loanProduct.findMany({
      where: this.allTokens(tokens, (t) => [has("name", t), has("slug", t), has("category", t)]),
      orderBy: { sortOrder: "asc" },
      take: limit * 3,
    });
    const hits: SearchHit[] = rankByName(products, (p) => p.name, tokens).slice(0, limit).map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: `Loan product${p.category ? ` · ${p.category}` : ""}`,
      where: admin ? "Settings › Loan products" : "Loan products",
      path: admin ? "/settings" : "/leads",
      hash: admin ? "products" : undefined,
      matches: pickMatches([{ label: "Loan product", value: p.name }, { label: "Category", value: p.category ?? "" }], tokens),
    }));

    if (admin) {
      const items = await this.prisma.checklistItem.findMany({
        where: this.allTokens(tokens, (t) => [has("label", t), has("category", t), { loanProduct: has("name", t) }]),
        include: { loanProduct: { select: { name: true } } },
        take: limit,
      });
      for (const c of items.slice(0, Math.max(0, limit - hits.length))) {
        hits.push({
          id: c.id,
          title: c.label,
          subtitle: `Required document · ${c.loanProduct?.name ?? "all products"}`,
          where: "Settings › Document checklist",
          path: "/settings",
          hash: "checklist",
          matches: pickMatches([{ label: "Document", value: c.label }, { label: "Category", value: c.category }], tokens),
        });
      }
      const cards = await this.prisma.commissionRateCard.findMany({
        where: this.allTokens(tokens, (t) => [has("label", t), has("avgAmountLabel", t), has("earningLabel", t)]),
        take: limit,
      });
      for (const c of cards.slice(0, Math.max(0, limit - hits.length))) {
        hits.push({
          id: c.id,
          title: c.label,
          subtitle: "Commission rate card",
          where: "Settings › Commission rate cards",
          path: "/settings",
          hash: "ratecards",
          matches: pickMatches([{ label: "Rate card", value: c.label }], tokens),
        });
      }
    }
    return { type: "products", label: "Loan products & documents", total: hits.length, hits: hits.slice(0, limit) };
  }

  // ── pages and settings (static) ───────────────────────────

  private pages(tokens: string[], limit: number, role: Role): SearchGroup {
    const hits: SearchHit[] = [];
    for (const p of PAGES) {
      if (p.roles && !p.roles.includes(role)) continue;
      const cands: Candidate[] = [{ label: "Page", value: p.label }, { label: "Related", value: p.keywords }];
      if (tokens.every((t) => cands.some((c) => contains(c.value, t)))) {
        hits.push({
          id: p.path,
          title: p.label,
          subtitle: "Open this page",
          where: "Pages",
          path: p.path,
          hash: p.hash,
          matches: pickMatches(cands.slice(0, 1), tokens),
        });
      }
    }
    if (role === Role.ADMIN) {
      for (const tab of SETTINGS_TABS) {
        const cands: Candidate[] = [{ label: "Setting", value: tab.label }, { label: "Related", value: tab.keywords }];
        if (tokens.every((t) => cands.some((c) => contains(c.value, t)))) {
          hits.push({ id: tab.hash, title: tab.label, subtitle: "Settings tab", where: "Settings", path: "/settings", hash: tab.hash, matches: [] });
        }
      }
      for (const s of SETTINGS) {
        const cands: Candidate[] = [{ label: "Setting", value: s.label }, { label: "Help", value: s.help ?? "" }, { label: "Key", value: s.key }];
        if (tokens.every((t) => cands.some((c) => contains(c.value, t)))) {
          hits.push({
            id: s.key,
            title: s.label,
            subtitle: `Setting · ${s.group}`,
            where: `Settings › ${s.group}`,
            path: "/settings",
            hash: `setting-${s.key}`,
            matches: pickMatches(cands, tokens),
          });
        }
      }
    }
    return { type: "pages", label: "Pages & settings", total: hits.length, hits: hits.slice(0, limit) };
  }

  // ── audit trail ───────────────────────────────────────────

  private async audit(tokens: string[], limit: number): Promise<SearchGroup> {
    const has = this.has;
    const where: Prisma.AuditLogWhereInput = this.allTokens(tokens, (t) => [has("entityLabel", t), has("actorName", t), has("entity", t)]);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      type: "audit",
      label: "Activity log",
      total,
      hits: rows.map((a) => {
        const link = a.entity === "Lead" ? `/leads/${a.entityId}` : a.entity === "Application" ? `/applications/${a.entityId}` : null;
        return {
          id: a.id,
          title: `${a.entityLabel ?? a.entity}`,
          subtitle: `${a.actorName} · ${a.action.toLowerCase()} ${a.entity} · ${a.createdAt.toISOString().slice(0, 10)}`,
          where: link ? `${a.entity}s › ${a.entityLabel ?? ""}` : "Audit log",
          path: link ?? "/audit",
          matches: pickMatches(
            [{ label: "Record", value: a.entityLabel ?? "" }, { label: "By", value: a.actorName }, { label: "Type", value: a.entity }],
            tokens,
          ),
        };
      }),
    };
  }
}
