// Checks on what the AI read from a flyer. A flyer is read twice (the second time box by box); a figure goes in only when
// both readings agree, it passes common-sense limits, and the words the AI quoted as proof really contain it. Anything
// else is blanked and listed as "check this", so a wrong figure is never added quietly.
import type { Extraction, OfferTerms } from "./offer-extraction";

export type Flag = {
  scheme: string;
  field: string;
  label: string;
  reason: "readings-differ" | "out-of-range" | "proof-mismatch" | "scheme-in-one-reading";
  /** What each reading said (as text), for a person to compare with the flyer. */
  readingA?: string | null;
  readingB?: string | null;
  evidence?: string | null;
};

export type Checks = { readings: 1 | 2; input: "text" | "pdf" | "image"; flags: Flag[] };

type Kind = "rupees" | "months" | "percent" | "plain";
const NUMERIC: Record<string, { label: string; kind: Kind; min: number; max: number }> = {
  minAmount: { label: "Smallest loan", kind: "rupees", min: 10_000, max: 5e10 },
  maxAmount: { label: "Largest loan", kind: "rupees", min: 10_000, max: 5e10 },
  minRate: { label: "Lowest interest rate", kind: "percent", min: 3, max: 60 },
  maxRate: { label: "Highest interest rate", kind: "percent", min: 3, max: 60 },
  minTenureMonths: { label: "Shortest tenure", kind: "months", min: 1, max: 480 },
  maxTenureMonths: { label: "Longest tenure", kind: "months", min: 1, max: 480 },
  minAge: { label: "Minimum age", kind: "plain", min: 18, max: 100 },
  maxAge: { label: "Maximum age", kind: "plain", min: 18, max: 100 },
  minTurnover: { label: "Minimum turnover", kind: "rupees", min: 100_000, max: 5e11 },
  minVintageMonths: { label: "Minimum business vintage", kind: "months", min: 1, max: 600 },
  foirPct: { label: "FOIR", kind: "percent", min: 20, max: 100 },
  minCreditScore: { label: "Minimum credit score", kind: "plain", min: 300, max: 900 },
};
const TEXTS: Record<string, string> = { ltv: "LTV", processingFee: "Processing fee" };

const squash = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9.%]+/g, " ").trim();
const same = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-6 : squash(a) === squash(b));
const shown = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

/** Every figure in a quote, as the values it could mean for a field of this kind. */
export function figuresIn(quote: string, kind: Kind): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|lac|l|k|%|years?|yrs?|yr|months?|mths?|m)?\b/gi;
  for (const m of quote.matchAll(re)) {
    const n = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const u = (m[2] ?? "").toLowerCase();
    if (kind === "rupees") out.push(n * (/^cr/.test(u) ? 1e7 : /^(l|lac)/.test(u) ? 1e5 : u === "k" ? 1e3 : 1));
    else if (kind === "months") out.push(/^(y)/.test(u) ? n * 12 : n);
    else out.push(n);
  }
  return out;
}

/** True when the quote contains the value (rounded sensibly); false when it clearly does not. */
export function evidenceSupports(kind: Kind, value: number, quote: string): boolean {
  // a rate printed per month is stored per year, so x12 also counts
  return figuresIn(quote, kind).some((f) => [f, ...(kind === "percent" ? [f * 12] : [])].some((g) => Math.abs(g - value) <= Math.max(Math.abs(value) * 0.01, 0.005)));
}

const nameOf = (o: OfferTerms) => o.scheme ?? o.productSlug ?? "Scheme";

/** Compares two readings of the same flyer. Returns the reading to keep (disagreeing figures blanked) and what to check. */
export function verifyReadings(a: Extraction, b: Extraction | null, input: Checks["input"]): Extraction {
  const flags: Flag[] = [];
  const mate = (o: OfferTerms) => b?.offers.find((x) => squash(x.scheme ?? x.productSlug) === squash(o.scheme ?? o.productSlug)) ?? null;
  const offers = a.offers.map((o0): OfferTerms => {
    const o: OfferTerms = { ...o0, conditions: { ...o0.conditions }, evidence: { ...(o0.evidence ?? {}) } };
    const scheme = nameOf(o);
    const other = b ? mate(o0) : null;
    const rec = o as unknown as Record<string, unknown>;
    const blank = (field: string, label: string, reason: Flag["reason"], extra: Partial<Flag>) => {
      rec[field] = null;
      flags.push({ scheme, field, label, reason, ...extra });
    };
    if (b && !other) flags.push({ scheme, field: "scheme", label: "Whole scheme", reason: "scheme-in-one-reading", readingA: "read", readingB: "not found" });
    if (other) {
      const rb = other as unknown as Record<string, unknown>;
      for (const f of Object.keys(NUMERIC)) if (!same(rec[f] ?? null, rb[f] ?? null)) blank(f, NUMERIC[f]!.label, "readings-differ", { readingA: shown(rec[f]), readingB: shown(rb[f]) });
      for (const f of Object.keys(TEXTS)) if (!same(rec[f] ?? null, rb[f] ?? null)) blank(f, TEXTS[f]!, "readings-differ", { readingA: shown(rec[f]), readingB: shown(rb[f]) });
      for (const k of new Set([...Object.keys(o.conditions), ...Object.keys(other.conditions)])) {
        if (!same(o.conditions[k] ?? null, other.conditions[k] ?? null)) {
          flags.push({ scheme, field: `conditions.${k}`, label: `Condition: ${k}`, reason: "readings-differ", readingA: shown(o.conditions[k]), readingB: shown(other.conditions[k]) });
          delete o.conditions[k];
        }
      }
      for (const [k, v] of Object.entries(other.evidence ?? {})) o.evidence![k] ??= v;
    }
    for (const [f, spec] of Object.entries(NUMERIC)) {
      const v = rec[f];
      if (typeof v !== "number") continue;
      if (v < spec.min || v > spec.max) { blank(f, spec.label, "out-of-range", { readingA: String(v) }); continue; }
      const quote = o.evidence?.[f];
      if (quote && !evidenceSupports(spec.kind, v, quote)) blank(f, spec.label, "proof-mismatch", { readingA: String(v), evidence: quote });
    }
    return o;
  });
  // schemes only the second reading found are not added, only pointed out
  if (b) for (const o of b.offers) if (!a.offers.some((x) => squash(x.scheme ?? x.productSlug) === squash(o.scheme ?? o.productSlug))) flags.push({ scheme: nameOf(o), field: "scheme", label: "Whole scheme", reason: "scheme-in-one-reading", readingA: "not found", readingB: "read" });

  const sheet = { ...a.sheet } as Record<string, unknown>;
  if (b) {
    const sb = b.sheet as Record<string, unknown>;
    for (const k of Object.keys(sheet)) if (!same(JSON.stringify(sheet[k]), JSON.stringify(sb[k] ?? null))) {
      flags.push({ scheme: "One-pager", field: `sheet.${k}`, label: k, reason: "readings-differ", readingA: shown(JSON.stringify(sheet[k])), readingB: shown(JSON.stringify(sb[k] ?? null)) });
      delete sheet[k];
    }
  }
  return { ...a, offers, sheet: sheet as Extraction["sheet"], checks: { readings: b ? 2 : 1, input, flags } };
}

/** Whether a reading is safe to add without a person looking: read twice, nothing to check, and not a picture. */
export function fullyVerified(x: Extraction): boolean {
  const c = x.checks;
  return Boolean(c && c.readings === 2 && c.flags.length === 0 && c.input !== "image");
}
