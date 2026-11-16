import { cleanSheet, type SheetData } from "./policy-sheet-schema";

// The figures a flyer or a saved policy holds for a product (amount range, rate range, tenure, fee), laid into the policy
// one-pager's own fields. Home Loan and Loan Against Property only, matched by loan-type slug; nothing is guessed, so a
// figure that does not clearly belong to a field is left out.

export type TermsLike = {
  productSlug?: string | null;
  scheme?: string | null;
  /** A saved policy keeps its scheme name here. */
  specialScheme?: string | null;
  minAmount?: number | string | null;
  maxAmount?: number | string | null;
  minRate?: number | string | null;
  maxRate?: number | string | null;
  maxTenureMonths?: number | null;
  processingFee?: string | null;
  employmentTypes?: string[] | null;
  minCreditScore?: number | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

/** "8.75% onwards", "8.75% to 10.5%", "up to 10.5%" or "9%", as the one-pager words a rate. */
export function roiText(min: unknown, max: unknown): string | null {
  const a = num(min);
  const b = num(max);
  if (a === null && b === null) return null;
  if (a !== null && b !== null) return a === b ? pct(a) : `${pct(Math.min(a, b))} to ${pct(Math.max(a, b))}`;
  return a !== null ? `${pct(a)} onwards` : `up to ${pct(b!)}`;
}

const SLUG_KEY: Record<string, "hl" | "lap"> = { "home-loan": "hl", "loan-against-property": "lap" };

/** The one-pager fields these terms fill. The first term to state a figure wins when a product is listed twice. */
export function sheetFromTerms(terms: TermsLike[]): SheetData {
  const out: Record<string, string | number | null> = {};
  const set = (key: string, value: string | number | null) => {
    if (value !== null && value !== "" && out[key] === undefined) out[key] = value;
  };
  const scores: number[] = [];
  for (const t of terms) {
    const k = t.productSlug ? SLUG_KEY[t.productSlug] : undefined;
    if (!k) continue;
    const K = k.toUpperCase();
    set("scheme", (t.scheme ?? t.specialScheme)?.trim() || null);
    set(`${k}Min`, num(t.minAmount));
    set(`${k}Max`, num(t.maxAmount));
    set(`${k}Roi`, roiText(t.minRate, t.maxRate));
    const score = num(t.minCreditScore);
    if (score !== null) scores.push(score);

    // Who the figure is for: everyone when the page names no one, otherwise only the named groups.
    const who = (t.employmentTypes ?? []).map((x) => x.toLowerCase());
    const sal = who.length === 0 || who.includes("salaried");
    const sep = who.length === 0 || who.includes("self-employed") || who.includes("business");
    const prof = who.includes("professional");
    const months = num(t.maxTenureMonths);
    const years = months === null ? null : Math.round((months / 12) * 10) / 10;
    if (years !== null) {
      if (sal) set(`tenSal${K}`, years);
      if (sep) set(`tenSep${K}`, years);
      if (prof) set(`tenProf${K}`, years);
    }
    // Only a fee that is stated as a percentage; anything wordier stays on the policy itself.
    const fee = t.processingFee?.match(/^\s*(\d+(?:\.\d+)?)\s*%/);
    if (fee) {
      const p = Number(fee[1]);
      if (sal) set(`pfSal${K}`, p);
      if (sep) set(`pfSep${K}`, p);
    }
  }
  if (scores.length) set("minCibil", Math.min(...scores));
  return cleanSheet(out);
}
