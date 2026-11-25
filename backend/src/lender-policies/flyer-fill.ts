// Fills the blank rules on a lender's policy from what the lender's own flyers say: the rate sheet recorded for the lender and
// the flyer text kept in the policy's notes. It only ever fills a blank. Where a flyer gives several figures (one per program),
// the most lenient is taken, so a customer is never ruled out by a stricter program than the one that fits.

export type FillSource = {
  product: string; // loan product slug
  notes?: string | null;
  specialScheme?: string | null;
  sheet?: Record<string, unknown> | null;
};
export type CurrentRules = {
  minAmount: number | null;
  maxAmount: number | null;
  minRate: number | null;
  maxRate: number | null;
  maxTenureMonths: number | null;
  minCreditScore: number | null;
  minAge: number | null;
  maxAgeAtMaturity: number | null;
  foirBands: unknown;
  ltvBands: unknown;
};
export type FilledRules = Partial<{
  minAmount: number | null;
  maxAmount: number;
  minRate: number;
  maxRate: number;
  maxTenureMonths: number;
  minCreditScore: number;
  minAge: number;
  maxAgeAtMaturity: number;
  foirBands: { upTo: null; value: number }[];
  ltvBands: { upTo: null; value: number }[];
}>;

/** Loan types secured on a property, where a loan-to-value figure in a flyer means what it says. */
const PROPERTY_LOANS = /home|property|lap|mortgage|plot|construction|balance-transfer|commercial/;

const all = (text: string, re: RegExp) => [...text.matchAll(re)];
const within = (values: number[], low: number, high: number) => values.filter((v) => Number.isFinite(v) && v >= low && v <= high);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,₹\s%]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Loan-to-value figures, leaving out ones that are a share of something else (turnover, rent, land alone). */
export function ltvFrom(text: string): number | null {
  const found: number[] = [];
  for (const m of all(text, /\bLTV\b[^|;.\n]{0,40}?(\d{2})\s?%([^|;\n]{0,40})/gi)) {
    if (/turnover|rent|land value|\bgross\b/i.test(`${m[0]}`)) continue;
    found.push(Number(m[1]));
  }
  for (const m of all(text, /(\d{2})\s?%\s*(?:LTV\b|of (?:the )?(?:property|market|agreement) value)/gi)) found.push(Number(m[1]));
  const ok = within(found, 30, 90);
  return ok.length ? Math.max(...ok) : null;
}

/** The share of income that may go to EMIs. Figures over 100% (a lender's special programs) are not the usual rule. */
export function foirFrom(text: string): number | null {
  const found: number[] = [];
  for (const m of all(text, /\b(?:FOIR|DBR)\b[^|;.\n\d]{0,30}(\d{2,3})\s?%(?:\s*(?:-|–|to)\s*(\d{2,3})\s?%)?/gi)) found.push(Number(m[1]), Number(m[2] ?? m[1]));
  for (const m of all(text, /(\d{2,3})\s?%\s*(?:FOIR|DBR)\b/gi)) found.push(Number(m[1]));
  const ok = within(found, 40, 100);
  return ok.length ? Math.max(...ok) : null;
}

export function creditScoreFrom(text: string): number | null {
  const found = all(text, /\b(?:CIBIL|credit score|bureau score)\b[^|;.\n\d]{0,30}(\d{3})/gi).map((m) => Number(m[1]));
  const ok = within(found, 600, 800);
  return ok.length ? Math.min(...ok) : null;
}

export function agesFrom(text: string): { min: number | null; max: number | null } {
  const lows: number[] = [];
  const highs: number[] = [];
  for (const m of all(text, /\bage\b[^|;.\n\d]{0,40}(\d{2})\s*(?:-|–|to)\s*(\d{2})(?:\s*years?)?/gi)) {
    lows.push(Number(m[1]));
    highs.push(Number(m[2]));
  }
  const low = within(lows, 18, 30);
  const high = within(highs, 50, 80);
  return { min: low.length ? Math.min(...low) : null, max: high.length ? Math.max(...high) : null };
}

export function tenureMonthsFrom(text: string): number | null {
  const years = all(text, /\btenure\b[^|;.\n\d]{0,30}(\d{1,2})\s*years?/gi).map((m) => Number(m[1]) * 12);
  const months = all(text, /\btenure\b[^|;.\n\d]{0,30}(\d{2,3})\s*months?/gi).map((m) => Number(m[1]));
  const ok = within([...years, ...months], 12, 420);
  return ok.length ? Math.max(...ok) : null;
}

export function rulesFromFlyers(source: FillSource, current: CurrentRules): { patch: FilledRules; filled: string[] } {
  const text = [source.notes, source.specialScheme].filter(Boolean).join(" | ");
  const sheet = source.sheet ?? {};
  const patch: FilledRules = {};
  const set = <K extends keyof FilledRules>(key: K, value: FilledRules[K] | null | undefined) => {
    if (value !== null && value !== undefined && (current as Record<string, unknown>)[key] === null) patch[key] = value;
  };

  // The rate sheet has separate figures for home loans and loans against property; it says nothing about other loan types.
  const side = source.product === "home-loan" ? "HL" : source.product === "loan-against-property" ? "LAP" : null;
  if (side) {
    const low = side === "HL" ? "hl" : "lap";
    set("minAmount", num(sheet[`${low}Min`]));
    set("maxAmount", num(sheet[`${low}Max`]));
    const rates = all(String(sheet[`${low}Roi`] ?? ""), /(\d{1,2}(?:\.\d{1,2})?)/g).map((m) => Number(m[1]));
    const sane = within(rates, 5, 30);
    if (sane.length) {
      set("minRate", Math.min(...sane));
      set("maxRate", Math.max(...sane));
    }
    const years = [`tenSal${side}`, `tenSep${side}`, `tenProf${side}`].map((k) => num(sheet[k])).filter((v): v is number => v !== null && v <= 35);
    if (years.length) set("maxTenureMonths", Math.max(...years) * 12);
    set("minCreditScore", within([num(sheet.minCibil) ?? 0], 600, 800)[0] ?? null);
  }

  set("minCreditScore", patch.minCreditScore ?? creditScoreFrom(text));
  set("maxTenureMonths", patch.maxTenureMonths ?? tenureMonthsFrom(text));
  const ages = agesFrom(text);
  set("minAge", ages.min);
  set("maxAgeAtMaturity", ages.max);
  const foir = foirFrom(text);
  if (foir !== null) set("foirBands", [{ upTo: null, value: foir }]);
  if (PROPERTY_LOANS.test(source.product)) {
    const ltv = ltvFrom(text);
    if (ltv !== null) set("ltvBands", [{ upTo: null, value: ltv }]);
  }

  // "Up to ₹25 lakh" read as both the least and the most: the least was never stated.
  if (current.minAmount !== null && current.maxAmount !== null && current.minAmount === current.maxAmount) patch.minAmount = null;
  // A filled limit must not contradict what is already there.
  const min = patch.minAmount === undefined ? current.minAmount : patch.minAmount;
  const max = patch.maxAmount ?? current.maxAmount;
  if (min !== null && max !== null && min >= max) {
    if (patch.maxAmount !== undefined) delete patch.maxAmount;
    if (patch.minAmount !== undefined && patch.minAmount !== null) delete patch.minAmount;
  }
  return { patch, filled: Object.keys(patch) };
}
