/**
 * Cleaning rules for bringing the firm's old calling workbook ("Lead Data" sheet) into the CRM. Plain functions over
 * plain values: no database, no files, so every rule can be tested. docs/DATA-MIGRATION.md explains the plan.
 *
 * Nothing here invents data. A value that cannot be read with confidence is left out and counted in the report.
 */

export type Cell = string | number | Date | null | undefined;

/** The columns of the Lead Data sheet, by position (A = 0). */
export const COL = {
  code: 0,
  date: 1,
  company: 2,
  customer: 3,
  designation: 4,
  product: 5,
  scheme: 6,
  resiAddr: 7,
  officeAddr: 8,
  mobile: 9,
  resiPhone: 10,
  officePhone: 11,
  amount: 12,
  dob: 13,
  panOrTenure: 14,
  emiRate: 15,
  callDate: 16,
  followUp: 17,
  callPerson: 18,
  remarks: 19,
  risk: 20,
  category: 21,
  eligible: 22,
  dscr: 23,
  turnover: 24,
  yearsInBusiness: 25,
  cibil: 26,
  cashProfit: 27,
  netWorth: 28,
  debtEquity: 29,
  currentRatio: 30,
  netProfitRatio: 31,
  inventoryDebt: 32,
  payableDays: 33,
  pbditTurnover: 34,
  pbditCapital: 35,
  debtPbdit: 36,
  phone: 37,
} as const;

const text = (v: Cell): string => (v === null || v === undefined || v instanceof Date ? "" : String(v).trim());

// ── Phone numbers ────────────────────────────────────────────────────────────────────────────

const MOBILE = /^[6-9]\d{9}$/;
/** Dummy numbers people type when they have none: 9999999999, 9876543210 and the like. */
const FAKE = /^(\d)\1{9}$|^(?:9876543210|1234567890|9123456789)$/;

function asMobile(digits: string): string | null {
  let d = digits;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return MOBILE.test(d) && !FAKE.test(d) ? d : null;
}

/**
 * Every valid Indian mobile number inside the given cells. A cell may hold several numbers run together with slashes,
 * commas or spaces; each is picked out. A number split by a space or dash ("98200 12345") is joined when the whole cell
 * is one number. Landlines and anything else are ignored. The order of the cells and of the numbers in each is kept.
 */
export function extractMobiles(...cells: Cell[]): string[] {
  const found: string[] = [];
  for (const cell of cells) {
    const raw = text(cell);
    if (!raw) continue;
    const chunks = raw.split(/[^\d]+/).filter(Boolean);
    const hits = chunks.map(asMobile).filter((m): m is string => m !== null);
    if (hits.length) found.push(...hits);
    else {
      const joined = asMobile(raw.replace(/\D/g, ""));
      if (joined) found.push(joined);
    }
  }
  return [...new Set(found)];
}

// ── Amounts ──────────────────────────────────────────────────────────────────────────────────

export type AmountResult = { value?: number; flag?: "tiny" | "huge" | "unreadable" };

const TEN_CRORE = 100_000_000;

/**
 * A loan amount in rupees. Text with no digits at all is treated as no amount. Accepts numbers, "1,00,000", "10 L", "50 lakh", "1.5 Cr". Under ₹10,000 is not believed (it is
 * usually a figure in lakhs or crores with the unit missing), and over ₹10 crore is held for a person to look at. In
 * those cases no value is returned, only the flag.
 */
export function parseAmount(cell: Cell): AmountResult {
  if (cell === null || cell === undefined || cell === "") return {};
  // Words with no digits are not an amount (in the 99 Databank batch this column holds the city): nothing to read.
  if (typeof cell === "string" && !/\d/.test(cell)) return {};
  let value: number | null = null;
  if (typeof cell === "number") value = cell;
  else if (typeof cell === "string") {
    const t = cell.toLowerCase().replace(/[₹,\s]|rs\.?|inr/g, "");
    const m = /^(\d+(?:\.\d+)?)(cr|crore|crores|l|lac|lacs|lakh|lakhs|lk|k)?$/.exec(t);
    if (m) {
      const n = Number(m[1]);
      const unit = m[2];
      value = !unit ? n : /^c/.test(unit) ? n * 10_000_000 : /^k/.test(unit) ? n * 1000 : n * 100_000;
    }
  }
  if (value === null || !Number.isFinite(value)) return { flag: "unreadable" };
  if (value < 10_000) return { flag: "tiny" };
  if (value > TEN_CRORE) return { flag: "huge" };
  return { value: Math.round(value) };
}

/** Places of the Mumbai region seen in the sheet. */
const PLACE = /\b(mumbai|thane|navi\s*mumbai|vasai|virar|kalyan|dombiv[a-z]*|bhiwandi|panvel|ambernath|badlapur|bhayandar|mira\s*road|goregaon|pune|nashik)\b/i;

/**
 * In the 99 Databank batch (and a few others) the "Loan Amount" column holds the city. When it holds a known place it is
 * the lead's city. Other words there (a first name, "EMI") are neither an amount nor a city and are ignored.
 */
export function cityFromAmountColumn(cell: Cell): string | undefined {
  const t = text(cell);
  if (!t || /\d/.test(t) || t.length > 30 || !PLACE.test(t)) return undefined;
  return tidyName(t).replace(/^Navimumbai$/, "Navi Mumbai");
}

// ── Names, products, callers, dates ──────────────────────────────────────────────────────────

/** Tidies a name: collapses spaces, strips stray punctuation, and turns ALL CAPS into Title Case (mixed case is left alone). */
export function tidyName(cell: Cell): string {
  let s = text(cell).replace(/\s+/g, " ").replace(/^[\s.,;:/\\-]+|[\s.,;:/\\-]+$/g, "");
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s(/.-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  }
  return s.slice(0, 120);
}

/** The CRM loan product (by slug) for the workbook's short codes. Anything not listed here is left unmapped, not guessed. */
const PRODUCTS: Record<string, string> = {
  BL: "business-loan",
  UBL: "business-loan",
  HL: "home-loan",
  LAP: "loan-against-property",
  PL: "personal-loan",
  WCL: "working-capital-term-loan",
};

export const mapProduct = (cell: Cell): string | undefined => PRODUCTS[text(cell).toUpperCase()];

/** Team members' names with the typos in the sheet fixed ("Soursih"); "0" and blank mean nobody. */
export function normalizeCaller(cell: Cell): string | undefined {
  const raw = text(cell);
  if (!raw || raw === "0") return undefined;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (key.startsWith("sourish") || key.startsWith("soursih")) return "Sourish";
  if (key.startsWith("mahesh")) return "Mahesh";
  if (key.startsWith("sheetal")) return "Sheetal";
  if (key.startsWith("sneha")) return "Sneha";
  return tidyName(raw);
}

/** A real date between 2000 and 2100, from a Date, an Excel serial number, or dd/mm/yyyy or yyyy-mm-dd text. */
export function parseDate(cell: Cell): Date | undefined {
  let d: Date | undefined;
  if (cell instanceof Date) d = cell;
  else if (typeof cell === "number" && cell > 20_000 && cell < 80_000) d = new Date(Date.UTC(1899, 11, 30) + cell * 86_400_000);
  else if (typeof cell === "string") {
    const t = cell.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (m) d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
    else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) d = new Date(Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!));
  }
  return d && !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100 ? d : undefined;
}

/** A follow-up date is kept only when it is still ahead of us (and not absurdly far): old ones would all show as overdue. */
export function futureFollowUp(cell: Cell, now: Date): Date | undefined {
  const d = parseDate(cell);
  return d && d.getTime() > now.getTime() && d.getTime() < now.getTime() + 2 * 365 * 86_400_000 ? d : undefined;
}

// ── What the remarks and the scheme column say ──────────────────────────────────────────────

export type RemarkKind = "DND" | "WRONG_NUMBER" | "NOT_INTERESTED" | "CALL_BACK" | "RINGING" | "INTERESTED" | "OTHER" | "NONE";

/** Reads a call remark. Order matters: a do-not-disturb beats a wrong number, which beats "not interested", and so on. */
export function classifyRemark(cell: Cell): RemarkKind {
  const t = text(cell).toLowerCase();
  if (!t) return "NONE";
  if (/\bdnd\b|do not disturb|\bndnc\b|\bdnc\b/.test(t)) return "DND";
  if (/wrong no|wrong number|not in service|does not exist|invalid|incorrect no|no longer in use|number not (valid|exist)/.test(t)) return "WRONG_NUMBER";
  if (/not (int|inter)|no req|no need|not req|not looking|don.?t (want|req)|dont (want|req)|do not want|already (taken|have)|not intrested/.test(t)) return "NOT_INTERESTED";
  if (/call back|callback|call later|will call|busy|in meeting/.test(t)) return "CALL_BACK";
  if (/ringing|no answer|not (picking|reachable|answering)|switch(ed)? off/.test(t)) return "RINGING";
  // "Call & share our details" is the caller's own to-do note in this sheet, not a sign the customer is interested.
  if (/interested|requirement/.test(t)) return "INTERESTED";
  return "OTHER";
}

const DEAD_KINDS: RemarkKind[] = ["DND", "WRONG_NUMBER", "NOT_INTERESTED"];
export const isDead = (k: RemarkKind) => DEAD_KINDS.includes(k);

export const DEAD_REASON: Partial<Record<RemarkKind, string>> = {
  DND: "Asked not to be called (do not disturb)",
  WRONG_NUMBER: "Wrong or unreachable number",
  NOT_INTERESTED: "Not interested",
};

export type Outcome = "DISBURSED" | "POLICY_DECLINED" | "UNDERWRITER_REVIEW";

/** The case outcome the Scheme column sometimes holds. Other scheme names (UBL Sales, Normal, Surrogate...) are not outcomes. */
export function classifyOutcome(cell: Cell): Outcome | undefined {
  const t = text(cell).toUpperCase().replace(/\s+/g, " ");
  if (t === "DISBURSED") return "DISBURSED";
  if (t === "POLICY DECLINED" || t === "POLICY DECLINE") return "POLICY_DECLINED";
  if (t === "UNDERWRITER REVIEW") return "UNDERWRITER_REVIEW";
  return undefined;
}

/** A code used by this many rows or more is a source batch (99 Databank, Kotak, Shriram...); fewer is a per-case reference. */
export const BATCH_MIN_ROWS = 40;

export function batchCodes(rows: Cell[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const c = text(r[COL.code]).toUpperCase().replace(/\s+/g, " ");
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n >= BATCH_MIN_ROWS).map(([c]) => c));
}

// ── One cleaned row ──────────────────────────────────────────────────────────────────────────

export type StagedRow = {
  /** The row's line in the sheet (header is line 1). */
  line: number;
  batch: string;
  /** A per-case reference from the code column, when the code is not a batch. */
  ref?: string;
  createdAt?: Date;
  name: string;
  company: string;
  designation: string;
  city?: string;
  product?: string;
  productRaw: string;
  amount?: number;
  amountFlag?: AmountResult["flag"];
  outcome?: Outcome;
  mobiles: string[];
  callDate?: Date;
  caller?: string;
  remark: string;
  remarkKind: RemarkKind;
  followUpAt?: Date;
  resiAddr: string;
  officeAddr: string;
  pan?: string;
  /** Credit figures the sheet carries for a minority of rows, kept as they are. */
  credit: Record<string, string>;
};

const CREDIT_COLUMNS: [string, number][] = [
  ["Risk score", COL.risk],
  ["Risk category", COL.category],
  ["Eligible", COL.eligible],
  ["DSCR", COL.dscr],
  ["Turnover", COL.turnover],
  ["Years in business", COL.yearsInBusiness],
  ["CIBIL score", COL.cibil],
  ["Cash profit", COL.cashProfit],
  ["Net worth", COL.netWorth],
  ["Debt equity", COL.debtEquity],
  ["Current ratio", COL.currentRatio],
  ["Net profit ratio", COL.netProfitRatio],
];

const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;

export type CleanContext = { batches: Set<string>; now: Date };

export function cleanRow(r: Cell[], line: number, ctx: CleanContext): StagedRow {
  const code = text(r[COL.code]).replace(/\s+/g, " ");
  const isBatch = ctx.batches.has(code.toUpperCase());
  const amt = parseAmount(r[COL.amount]);
  const credit: Record<string, string> = {};
  for (const [label, i] of CREDIT_COLUMNS) {
    const v = text(r[i]);
    if (v && !(label === "CIBIL score" && Number(v) <= 0)) credit[label] = v.slice(0, 40);
  }
  const pan = text(r[COL.panOrTenure]).toUpperCase();
  const remark = text(r[COL.remarks]).replace(/\s+/g, " ").slice(0, 500);
  return {
    line,
    batch: isBatch ? code.toUpperCase() : "OTHER CASES",
    ...(code && !isBatch ? { ref: code.slice(0, 80) } : {}),
    createdAt: parseDate(r[COL.date]),
    name: tidyName(r[COL.customer]),
    company: tidyName(r[COL.company]),
    designation: tidyName(r[COL.designation]).slice(0, 60),
    city: cityFromAmountColumn(r[COL.amount]),
    product: mapProduct(r[COL.product]),
    productRaw: text(r[COL.product]).toUpperCase(),
    ...(amt.value !== undefined ? { amount: amt.value } : {}),
    ...(amt.flag ? { amountFlag: amt.flag } : {}),
    outcome: classifyOutcome(r[COL.scheme]),
    mobiles: extractMobiles(r[COL.mobile], r[COL.resiPhone], r[COL.officePhone], r[COL.phone]),
    callDate: parseDate(r[COL.callDate]),
    caller: normalizeCaller(r[COL.callPerson]),
    remark,
    remarkKind: classifyRemark(remark),
    followUpAt: futureFollowUp(r[COL.followUp], ctx.now),
    resiAddr: text(r[COL.resiAddr]).replace(/\s+/g, " ").slice(0, 300),
    officeAddr: text(r[COL.officeAddr]).replace(/\s+/g, " ").slice(0, 300),
    ...(PAN.test(pan) ? { pan } : {}),
    credit,
  };
}

// ── People: rows merged on mobile ────────────────────────────────────────────────────────────

export type HistoryEntry = { at?: Date; caller?: string; remark: string; kind: RemarkKind; batch: string; ref?: string; line: number };

export type Category = "LIVE" | "DEAD" | "NEEDS_PHONE";

export type StagedPerson = {
  /** The primary mobile: the key people are merged on. Absent for "Needs phone" rows. */
  key?: string;
  category: Category;
  deadReason?: string;
  doNotCall: boolean;
  name: string;
  company: string;
  designation: string;
  city?: string;
  mobiles: string[];
  product?: string;
  amount?: number;
  amountFlags: string[];
  createdAt?: Date;
  batches: string[];
  refs: string[];
  outcome?: Outcome;
  history: HistoryEntry[];
  followUpAt?: Date;
  resiAddr: string;
  officeAddr: string;
  pan?: string;
  credit: Record<string, string>;
  /** Rows of the sheet this person came from. */
  lines: number[];
};

const OUTCOME_RANK: Record<Outcome, number> = { DISBURSED: 3, POLICY_DECLINED: 2, UNDERWRITER_REVIEW: 1 };
const first = <T>(xs: (T | undefined | "")[]): T | undefined => xs.find((x): x is T => x !== undefined && x !== "");

function mergeGroup(rows: StagedRow[], key: string | undefined): StagedPerson {
  const ordered = [...rows].sort((a, b) => (a.callDate?.getTime() ?? 0) - (b.callDate?.getTime() ?? 0) || a.line - b.line);
  const newestFirst = [...ordered].reverse();
  const mobileCount = new Map<string, number>();
  for (const r of rows) for (const m of r.mobiles) mobileCount.set(m, (mobileCount.get(m) ?? 0) + 1);
  const mobiles = [...mobileCount].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  if (key) mobiles.splice(0, mobiles.length, key, ...mobiles.filter((m) => m !== key));

  const history: HistoryEntry[] = ordered
    .filter((r) => r.callDate || r.remark)
    .map((r) => ({ at: r.callDate, caller: r.caller, remark: r.remark, kind: r.remarkKind, batch: r.batch, ref: r.ref, line: r.line }));

  const latest = history[history.length - 1];
  const doNotCall = rows.some((r) => r.remarkKind === "DND");
  const outcome = rows.map((r) => r.outcome).filter((o): o is Outcome => !!o).sort((a, b) => OUTCOME_RANK[b] - OUTCOME_RANK[a])[0];
  const dead = doNotCall || (latest ? isDead(latest.kind) : false);
  const category: Category = !key ? "NEEDS_PHONE" : dead ? "DEAD" : "LIVE";
  const deadKind: RemarkKind | undefined = doNotCall ? "DND" : latest && isDead(latest.kind) ? latest.kind : undefined;

  const createdAt = rows.map((r) => r.createdAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
  const names = rows.map((r) => r.name).filter(Boolean);
  const best = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length)[0] ?? "";
  const credit: Record<string, string> = {};
  for (const r of ordered) Object.assign(credit, r.credit);

  return {
    ...(key ? { key } : {}),
    category,
    ...(category === "DEAD" && deadKind ? { deadReason: DEAD_REASON[deadKind] } : {}),
    doNotCall,
    name: best(names) || best(rows.map((r) => r.company).filter(Boolean)),
    company: best(rows.map((r) => r.company).filter(Boolean)),
    designation: first(rows.map((r) => r.designation)) ?? "",
    city: first(newestFirst.map((r) => r.city)),
    mobiles,
    product: first(newestFirst.map((r) => r.product)),
    amount: first(newestFirst.map((r) => r.amount)),
    amountFlags: [...new Set(rows.map((r) => r.amountFlag).filter((f): f is NonNullable<typeof f> => !!f))],
    createdAt,
    batches: [...new Set(rows.map((r) => r.batch))],
    refs: [...new Set(rows.map((r) => r.ref).filter((x): x is string => !!x))],
    outcome,
    history,
    followUpAt: first(newestFirst.map((r) => r.followUpAt)),
    resiAddr: first(newestFirst.map((r) => r.resiAddr)) ?? "",
    officeAddr: first(newestFirst.map((r) => r.officeAddr)) ?? "",
    pan: first(newestFirst.map((r) => r.pan)),
    credit,
    lines: rows.map((r) => r.line),
  };
}

/** Merges rows that share a primary mobile into one person. A row with no mobile is its own person. */
export function mergePeople(rows: StagedRow[]): StagedPerson[] {
  const byKey = new Map<string, StagedRow[]>();
  const loose: StagedRow[] = [];
  for (const r of rows) {
    const key = r.mobiles[0];
    if (!key) loose.push(r);
    else byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  return [...[...byKey].map(([k, g]) => mergeGroup(g, k)), ...loose.map((r) => mergeGroup([r], undefined))];
}

// ── Application records for old Shriram cases ───────────────────────────────────────────────

export type ApplicationCandidate = {
  status: "DISBURSED" | "REJECTED";
  lender: "Shriram";
  product?: string;
  amount?: number;
  /** True when it has everything an Application needs: product, amount and the entry date. */
  complete: boolean;
  missing: string[];
};

/**
 * Only the Shriram cases the sheet marks Disbursed or Policy declined become Applications; they are created archived and
 * with no Disbursement, Sanction or Commission, because the sheet has no disbursal date or disbursed amount.
 */
export function applicationCandidate(p: StagedPerson): ApplicationCandidate | undefined {
  if (p.outcome !== "DISBURSED" && p.outcome !== "POLICY_DECLINED") return undefined;
  if (!p.batches.includes("SHRIRAM")) return undefined;
  const missing = [!p.product && "product", p.amount === undefined && "amount", !p.createdAt && "date"].filter((x): x is string => !!x);
  return { status: p.outcome === "DISBURSED" ? "DISBURSED" : "REJECTED", lender: "Shriram", product: p.product, amount: p.amount, complete: missing.length === 0, missing };
}
