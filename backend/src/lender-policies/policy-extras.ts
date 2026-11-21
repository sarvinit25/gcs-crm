// Two things a lender's policy record could not hold before:
//  - PROGRAMS: a lender's named variants of one loan type, each with its own limits (SMFG Grihashakti's Salaried, SAM, Banking,
//    Low LTV, PMP-LIP and ITR programs are all "Home Loan", but each has its own amount, tenure, LTV, age and income rule).
//  - CONDITIONS: the rules a business lender sets that are not amounts or rates (credit rating, DSCR, guarantee, security,
//    drawing power, moratorium, end use, who it is not for).
// Both are cleaned here, so a bad or invented value from a flyer is dropped before a person sees it, and both merge by only
// ever adding: what a person already entered is never replaced.

/** Whether a rule has been confirmed with the lender. Unconfirmed rules are never passed off as approved policy. */
export type RuleStatus = "CONFIRMED" | "PENDING" | "NOT_APPLICABLE";
export const RULE_STATUSES: RuleStatus[] = ["CONFIRMED", "PENDING", "NOT_APPLICABLE"];
/** A rule one lender has and others do not (industry margins, MOB multipliers, funding formula ...), with its own status. */
export type ProgramRule = { label: string; value: string; status: RuleStatus };
/** The structured numbers the matcher can test, so each can carry its own status. */
export const CORE_RULES = ["maxFoirPct", "maxLtvPct", "abbMultiple", "minBusinessVintageMonths", "minCreditScore"] as const;
export type CoreRule = (typeof CORE_RULES)[number];

export type Program = {
  name: string;
  minAmount: number | null;
  maxAmount: number | null;
  minRate: number | null;
  maxRate: number | null;
  minTenureMonths: number | null;
  maxTenureMonths: number | null;
  /** Loan-to-value as printed, e.g. "80% (85% with insurance)". */
  ltv: string | null;
  minAge: number | null;
  maxAge: number | null;
  /** Who the program is for and how income is judged, in plain words. */
  who: string | null;
  documents: string[];
  /** Everything else the flyer says about this program. */
  conditions: string | null;
  fee: string | null;
  /** The lender's own limits for this program, as numbers the matcher can test. */
  maxFoirPct: number | null;
  maxLtvPct: number | null;
  /** The least average bank balance, as a multiple of the EMI. */
  abbMultiple: number | null;
  minBusinessVintageMonths: number | null;
  minCreditScore: number | null;
  /** SALARIED and/or SELF_EMPLOYED; blank means not stated. */
  employmentTypes: string[];
  propertyTypes: string[];
  /** For example "Self-occupied". */
  occupancy: string | null;
  /** Any extra rule this lender has for the program. */
  rules: ProgramRule[];
  /** Confirmed, pending or not applicable, for each structured number above; missing means not stated. */
  status: Partial<Record<CoreRule, RuleStatus>>;
};

export type ConditionType = "text" | "longtext" | "number" | "percent";
export type ConditionField = { key: string; label: string; type: ConditionType; hint?: string };

export const CONDITION_FIELDS: ConditionField[] = [
  { key: "rating", label: "Minimum credit rating of the borrower", type: "text", hint: "For example BBB- and above" },
  { key: "dscr", label: "Minimum DSCR (times)", type: "number", hint: "For example 1.2" },
  { key: "guarantee", label: "Guarantee", type: "text", hint: "For example personal and corporate guarantee required" },
  { key: "security", label: "Security / collateral", type: "text" },
  { key: "collateralMarginPct", label: "Cash or FD margin (%)", type: "percent" },
  { key: "chargeOnAssets", label: "Charge on current assets", type: "text" },
  { key: "drawingPower", label: "Drawing power", type: "text" },
  { key: "payableDays", label: "Maximum days payable", type: "number" },
  { key: "moratoriumMonths", label: "Moratorium (months)", type: "number" },
  { key: "fundingPct", label: "Maximum funding of the cost (%)", type: "percent" },
  { key: "endUse", label: "Allowed end use", type: "text" },
  { key: "sectors", label: "Sector or customer restriction", type: "text", hint: "For example manufacturing only" },
  { key: "profiles", label: "Customer profiles accepted", type: "longtext" },
  { key: "cibilPolicy", label: "If the credit score is low", type: "longtext" },
  { key: "specialFeatures", label: "Special features", type: "longtext" },
  { key: "payoutNote", label: "Payout note", type: "text" },
];
export type Conditions = Record<string, string | number>;

const FIELD = new Map(CONDITION_FIELDS.map((f) => [f.key, f]));

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[,%₹\s]/g, "")) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const whole = (v: unknown, min: number, max: number) => { const n = num(v, min, max); return n === null ? null : Math.round(n); };
const rupees = (v: unknown) => { const n = num(v, 1, 1e12); return n === null ? null : Math.round(n); };
const ordered = (lo: number | null, hi: number | null): [number | null, number | null] => (lo !== null && hi !== null && lo > hi ? [hi, lo] : [lo, hi]);

export function cleanConditions(raw: unknown): Conditions {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Conditions = {};
  for (const [key, value] of Object.entries(r)) {
    const f = FIELD.get(key);
    if (!f) continue;
    const v = f.type === "text" ? text(value, 200) : f.type === "longtext" ? text(value, 600) : f.type === "percent" ? num(value, 0, 100) : num(value, 0, 10000);
    if (v !== null) out[key] = v;
  }
  return out;
}

export function cleanProgram(raw: unknown): Program | null {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const name = text(r.name ?? r.scheme, 80);
  if (!name) return null;
  const [minAmount, maxAmount] = ordered(rupees(r.minAmount), rupees(r.maxAmount));
  const [minRate, maxRate] = ordered(num(r.minRate, 0, 100), num(r.maxRate, 0, 100));
  const [minTenureMonths, maxTenureMonths] = ordered(whole(r.minTenureMonths, 1, 600), whole(r.maxTenureMonths, 1, 600));
  const [minAge, maxAge] = ordered(whole(r.minAge, 18, 100), whole(r.maxAge, 18, 100));
  const ltv = text(r.ltv, 120);
  const status: Partial<Record<CoreRule, RuleStatus>> = {};
  const rawStatus = (r.status && typeof r.status === "object" && !Array.isArray(r.status) ? r.status : {}) as Record<string, unknown>;
  for (const k of CORE_RULES) if (RULE_STATUSES.includes(rawStatus[k] as RuleStatus)) status[k] = rawStatus[k] as RuleStatus;
  const rules: ProgramRule[] = [];
  for (const x of Array.isArray(r.rules) ? r.rules : []) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const label = text(o.label, 80);
    const value = text(o.value, 200);
    if (label && value && rules.length < 20) rules.push({ label, value, status: RULE_STATUSES.includes(o.status as RuleStatus) ? (o.status as RuleStatus) : "PENDING" });
  }
  const list = (v: unknown, allowed?: string[]) => (Array.isArray(v) ? v : []).map((x) => text(x, 60)).filter((x): x is string => Boolean(x) && (!allowed || allowed.includes(x as string))).slice(0, 10);
  return {
    name, minAmount, maxAmount, minRate, maxRate, minTenureMonths, maxTenureMonths,
    ltv: ltv && /\d\s*%/.test(ltv) ? ltv : null,
    minAge, maxAge,
    who: text(r.who, 300),
    documents: (Array.isArray(r.documents) ? r.documents : []).map((d) => text(d, 120)).filter((d): d is string => Boolean(d)).slice(0, 12),
    conditions: text(r.conditions, 500),
    fee: text(r.fee, 120),
    maxFoirPct: num(r.maxFoirPct, 1, 100),
    maxLtvPct: num(r.maxLtvPct, 1, 100),
    abbMultiple: num(r.abbMultiple, 0.1, 50),
    minBusinessVintageMonths: whole(r.minBusinessVintageMonths, 1, 600),
    minCreditScore: whole(r.minCreditScore, 300, 900),
    employmentTypes: list(r.employmentTypes, ["SALARIED", "SELF_EMPLOYED"]),
    propertyTypes: list(r.propertyTypes),
    occupancy: text(r.occupancy, 80),
    rules,
    status,
  };
}

export const MAX_PROGRAMS = 12;
export function cleanPrograms(raw: unknown): Program[] {
  const seen = new Set<string>();
  const out: Program[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const p = cleanProgram(x);
    const key = p ? squash(p.name) : "";
    if (!p || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= MAX_PROGRAMS) break;
  }
  return out;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const blank = (v: unknown) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

/** Adds programs that are new and fills only the blanks of ones already held; nothing is replaced. */
export function mergePrograms(existing: Program[], incoming: Program[]): { programs: Program[]; added: string[]; filled: string[] } {
  const programs = existing.map((p) => ({ ...p }));
  const added: string[] = [];
  const filled: string[] = [];
  for (const inc of incoming) {
    const at = programs.findIndex((p) => squash(p.name) === squash(inc.name));
    if (at < 0) {
      if (programs.length < MAX_PROGRAMS) { programs.push(inc); added.push(inc.name); }
      continue;
    }
    const have = programs[at]!;
    let any = false;
    for (const k of Object.keys(inc) as (keyof Program)[]) {
      if (k === "name") continue;
      if (blank(have[k]) && !blank(inc[k])) { (have as Record<string, unknown>)[k] = inc[k]; any = true; }
    }
    if (any) filled.push(have.name);
  }
  return { programs, added, filled };
}

/** Fills only the blanks of the conditions already held. */
export function mergeConditions(existing: Conditions, incoming: Conditions): { conditions: Conditions; filled: string[] } {
  const conditions: Conditions = { ...existing };
  const filled: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (conditions[k] === undefined || conditions[k] === "") { conditions[k] = v; filled.push(FIELD.get(k)?.label ?? k); }
  }
  return { conditions, filled };
}

/** Conditions as one readable line ("Minimum credit rating of the borrower: BBB- and above; Guarantee: ..."), for a program's own notes. */
export function conditionsText(c: Conditions): string {
  return CONDITION_FIELDS.filter((f) => c[f.key] !== undefined)
    .map((f) => `${f.label}: ${c[f.key]}`)
    .join("; ");
}

/** The conditions every scheme states, with the same value: the only ones that can fairly be said of the whole loan type. */
export function commonConditions(all: Conditions[]): Conditions {
  if (all.length < 2) return all[0] ? { ...all[0] } : {};
  const out: Conditions = {};
  for (const [k, v] of Object.entries(all[0]!)) if (all.every((c) => c[k] === v)) out[k] = v;
  return out;
}

/** A program's headline in one line, for lists. */
export function programLine(p: Program): string {
  const rupee = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString("en-IN")}`);
  const bits = [
    p.minAmount !== null && p.maxAmount !== null ? `${rupee(p.minAmount)} to ${rupee(p.maxAmount)}` : p.maxAmount !== null ? `up to ${rupee(p.maxAmount)}` : p.minAmount !== null ? `from ${rupee(p.minAmount)}` : null,
    p.maxTenureMonths !== null ? `${+(p.maxTenureMonths / 12).toFixed(1)} yrs` : null,
    p.minRate !== null ? `${p.minRate}%${p.maxRate !== null && p.maxRate !== p.minRate ? ` to ${p.maxRate}%` : ""}` : null,
    p.ltv ? `LTV ${p.ltv}` : null,
  ].filter(Boolean);
  return `${p.name}${bits.length ? `: ${bits.join(" · ")}` : ""}`;
}
