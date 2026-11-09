// What a flyer, poster or forwarded message says about a lender, as plain data. The AI only reads; everything it returns
// passes through `normalizeExtraction` here, so a bad or invented value is dropped before a person ever sees it.

export type OfferKind = "LENDER_OFFER" | "SERVICE_PROVIDER" | "OTHER";

export type OfferContact = { name: string | null; designation: string | null; phone: string | null; email: string | null };

export type OfferTerms = {
  /** The product's own name on the flyer (for example "Quasi" or "Property Power"). */
  scheme: string | null;
  /** One of our loan-product slugs, or null when the flyer's product is not one we offer. */
  productSlug: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  /** Percent a year. */
  minRate: number | null;
  maxRate: number | null;
  minTenureMonths: number | null;
  maxTenureMonths: number | null;
  rateType: "FLOATING" | "FIXED" | null;
  processingFee: string | null;
  employmentTypes: string[];
  gstRequired: boolean | null;
  minCreditScore: number | null;
  allIndia: boolean | null;
  cities: string[];
  ltv: string | null;
  documents: string[];
  charges: string | null;
  turnaround: string | null;
  notes: string | null;
};

export type Extraction = {
  kind: OfferKind;
  summary: string;
  lenderName: string | null;
  lenderType: "BANK" | "NBFC" | null;
  website: string | null;
  /** The lender's office address and city, when the page prints them. */
  address: string | null;
  city: string | null;
  contacts: OfferContact[];
  offers: OfferTerms[];
  /** The last day the offer holds (YYYY-MM-DD), when the page prints one. */
  validTill: string | null;
};

const KINDS: OfferKind[] = ["LENDER_OFFER", "SERVICE_PROVIDER", "OTHER"];
const EMPLOYMENT = ["Salaried", "Self-employed", "Professional", "Business"];

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const list = (v: unknown, max: number, each: number): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => text(x, each)).filter((x): x is string => Boolean(x)))].slice(0, max) : [];

/** "₹10 Lacs", "7.5 lakh", "2 crore", "1,50,000" or a plain number, as rupees. Anything else is unknown. */
export function toRupees(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const m = v.toLowerCase().replace(/[₹,]/g, "").trim().replace(/^(rs\.?|inr)\s*/, "").trim().match(/^(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|l|crores?|crs?|k)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  const scale = /^(lakh|lac|l)/.test(unit) ? 1e5 : /^(crore|cr)/.test(unit) ? 1e7 : unit === "k" ? 1e3 : 1;
  return Math.round(n * scale);
}

const percent = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/%/g, "").trim()) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
};

const whole = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  return Number.isFinite(n) && Math.round(n) >= min && Math.round(n) <= max ? Math.round(n) : null;
};

/** A phone number as ten digits when it is an Indian number, otherwise left as the digits written. */
export function cleanPhone(v: unknown): string | null {
  const digits = String(v ?? "").replace(/\D/g, "");
  const tail = digits.length >= 12 && digits.startsWith("91") ? digits.slice(-10) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return tail.length >= 8 && tail.length <= 15 ? tail : null;
}

const email = (v: unknown): string | null => {
  const t = text(v, 120)?.toLowerCase() ?? null;
  return t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
};

/** Keeps a range the right way round: a flyer's "10 to 5" is a misreading, not a rule. */
const ordered = (lo: number | null, hi: number | null): [number | null, number | null] => (lo !== null && hi !== null && lo > hi ? [hi, lo] : [lo, hi]);

function terms(raw: Record<string, unknown>, slugs: ReadonlySet<string>): OfferTerms {
  // A monthly rate (2.7% a month) is stored as the yearly figure, since that is what the matcher compares.
  const perMonth = String(raw.ratePeriod ?? "").toUpperCase() === "MONTH";
  const yearly = (n: number | null) => (n !== null && perMonth ? Math.round(n * 12 * 100) / 100 : n);
  const rate = (v: unknown) => { const n = yearly(percent(v)); return n !== null && n <= 100 ? n : null; };
  // A printed "0" or "nil" is no loan size at all; it must not read as a minimum of zero.
  const rupeesOrNull = (v: unknown) => { const n = toRupees(v); return n ? n : null; };
  const [minAmount, maxAmount] = ordered(rupeesOrNull(raw.minAmount), rupeesOrNull(raw.maxAmount));
  const [minRate, maxRate] = ordered(rate(raw.minRate), rate(raw.maxRate ?? raw.minRate));
  const [minTenureMonths, maxTenureMonths] = ordered(whole(raw.minTenureMonths, 1, 600), whole(raw.maxTenureMonths, 1, 600));
  const slug = text(raw.productSlug, 60);
  const employment = list(raw.employmentTypes, 6, 40)
    .map((e) => EMPLOYMENT.find((x) => x.toLowerCase().replace(/[^a-z]/g, "") === e.toLowerCase().replace(/[^a-z]/g, "")) ?? null)
    .filter((e): e is string => Boolean(e));
  const rateType = String(raw.rateType ?? "").toUpperCase();
  return {
    scheme: text(raw.scheme, 80),
    productSlug: slug && slugs.has(slug) ? slug : null,
    minAmount,
    maxAmount,
    minRate: minRate ?? (maxRate !== null ? maxRate : null),
    maxRate,
    minTenureMonths,
    maxTenureMonths,
    rateType: rateType === "FIXED" || rateType === "FLOATING" ? rateType : null,
    processingFee: text(raw.processingFee, 200),
    employmentTypes: [...new Set(employment)],
    gstRequired: typeof raw.gstRequired === "boolean" ? raw.gstRequired : null,
    minCreditScore: whole(raw.minCreditScore, 300, 900),
    allIndia: typeof raw.allIndia === "boolean" ? raw.allIndia : null,
    cities: list(raw.cities, 40, 60),
    // LTV is a percentage; a property type or document list put here by mistake is dropped.
    ltv: ((t) => (t && /\d\s*%/.test(t) ? t : null))(text(raw.ltv, 120)),
    documents: list(raw.documents, 20, 120),
    charges: text(raw.charges, 300),
    turnaround: text(raw.turnaround, 120),
    notes: text(raw.notes, 500),
  };
}

/** A printed date as YYYY-MM-DD, or null when it is not a real date. */
const isoDate = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${t}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t;
};

/** True when the page itself says the offer has ended before `today` (YYYY-MM-DD). */
export const offerEnded = (validTill: string | null | undefined, today: string) => Boolean(validTill && validTill < today);

/** Turns whatever the model returned into a safe Extraction. `slugs` are the loan types this CRM knows. */
export function normalizeExtraction(raw: unknown, slugs: ReadonlySet<string>): Extraction {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = KINDS.includes(r.kind as OfferKind) ? (r.kind as OfferKind) : "OTHER";
  const contacts = (Array.isArray(r.contacts) ? r.contacts : [])
    .map((c): OfferContact => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { name: text(o.name, 120), designation: text(o.designation, 80), phone: cleanPhone(o.phone), email: email(o.email) };
    })
    .filter((c) => c.phone || c.email)
    .slice(0, 10);
  const offers = kind === "LENDER_OFFER" ? (Array.isArray(r.offers) ? r.offers : []).slice(0, 12).map((o) => terms((o ?? {}) as Record<string, unknown>, slugs)) : [];
  const type = String(r.lenderType ?? "").toUpperCase();
  return {
    kind,
    summary: text(r.summary, 400) ?? "",
    lenderName: text(r.lenderName, 120),
    lenderType: type === "BANK" || type === "NBFC" ? type : null,
    website: text(r.website, 200),
    address: text(r.address, 300),
    city: text(r.city, 60),
    contacts,
    offers,
    validTill: isoDate(r.validTill),
  };
}

const LEGAL = new Set(["private", "pvt", "limited", "ltd", "co", "company", "corp", "corporation", "and", "the", "of"]);
/** Words that many different lenders share, so they can only be ignored when that leaves exactly one lender standing. */
const GENERIC = new Set(["bank", "finance", "financial", "services", "investment", "holdings"]);
const words = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w && !LEGAL.has(w));
const compact = (ws: string[]) => ws.join("");

/**
 * The lender already in the CRM that this name means, or null when it is not certain.
 * First the whole name must match (only "Ltd", "Pvt" and the like are ignored), so "Axis Finance" is never taken for
 * "Axis Bank". Failing that, words such as Bank and Finance are ignored, but only if exactly ONE lender is left standing:
 * "Bajaj Housing Finance Ltd" finds "Bajaj Housing", while a bare "Axis" matches nobody because two lenders fit.
 */
export function bestLender<T extends { id: string; name: string; shortName?: string | null }>(name: string | null, lenders: T[]): T | null {
  if (!name) return null;
  const target = words(name);
  if (!target.length) return null;
  const names = (l: T) => [l.name, ...(l.shortName ? [l.shortName] : [])].map(words).filter((w) => w.length);
  const exact = lenders.filter((l) => names(l).some((w) => compact(w) === compact(target)));
  if (exact.length) return exact.length === 1 ? exact[0]! : null;
  const loose = (ws: string[]) => compact(ws.filter((w) => !GENERIC.has(w)));
  const key = loose(target);
  if (!key) return null;
  const fits = lenders.filter((l) => names(l).some((w) => loose(w) === key));
  return fits.length === 1 ? fits[0]! : null;
}

const lo = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
const hi = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

export type PolicyDraft = {
  productSlug: string;
  minAmount: number | null;
  maxAmount: number | null;
  minRate: number | null;
  maxRate: number | null;
  minTenureMonths: number | null;
  maxTenureMonths: number | null;
  rateType: "FLOATING" | "FIXED" | null;
  processingFee: string | null;
  specialScheme: string | null;
  employmentTypes: string[];
  gstRequired: boolean;
  minCreditScore: number | null;
  allIndia: boolean;
  cities: string[];
  notes: string | null;
  schemes: number;
};

/**
 * One policy per loan type: several schemes on one flyer (a lender's "Quasi", "Property Power" and "Micro LAP") widen the
 * ranges, and each scheme's own figures are kept in the notes so nothing the flyer said is lost.
 */
/** A scheme that carries nothing to record: just a name. Adding it would only make an empty policy. */
export const hasTerms = (o: OfferTerms) =>
  [o.minAmount, o.maxAmount, o.minRate, o.maxRate, o.minTenureMonths, o.maxTenureMonths, o.minCreditScore].some((n) => n !== null) ||
  Boolean(o.processingFee || o.ltv || o.charges || o.turnaround || o.notes || o.rateType) ||
  o.employmentTypes.length > 0 || o.documents.length > 0 || o.cities.length > 0 || o.gstRequired !== null || o.allIndia !== null;

export function mergeOffers(offers: OfferTerms[]): { policies: PolicyDraft[]; skipped: number; empty: number } {
  const bySlug = new Map<string, OfferTerms[]>();
  let skipped = 0;
  let empty = 0;
  for (const o of offers) {
    if (!o.productSlug) { skipped += 1; continue; }
    if (!hasTerms(o)) { empty += 1; continue; }
    bySlug.set(o.productSlug, [...(bySlug.get(o.productSlug) ?? []), o]);
  }
  const policies = [...bySlug.entries()].map(([productSlug, group]): PolicyDraft => {
    const schemes = group.map((g) => g.scheme).filter((s): s is string => Boolean(s));
    const notes = group
      .map((g) => {
        const bits = [
          g.scheme && group.length > 1 ? g.scheme : null,
          g.minAmount !== null || g.maxAmount !== null ? `amount ₹${(g.minAmount ?? g.maxAmount)?.toLocaleString("en-IN")}${g.maxAmount !== null && g.maxAmount !== g.minAmount ? ` to ₹${g.maxAmount.toLocaleString("en-IN")}` : ""}` : null,
          g.minRate !== null ? `rate ${g.minRate}${g.maxRate !== null && g.maxRate !== g.minRate ? `% to ${g.maxRate}` : ""}%` : null,
          g.ltv ? `LTV ${g.ltv}` : null,
          g.turnaround ? `turnaround ${g.turnaround}` : null,
          g.charges ? `charges: ${g.charges}` : null,
          g.documents.length ? `documents: ${g.documents.join(", ")}` : null,
          g.notes,
        ].filter(Boolean);
        return bits.join("; ");
      })
      .filter(Boolean)
      .join(" | ")
      .slice(0, 1000);
    // Several schemes can disagree (one says "1 crore", another "up to 60 lakh"): a minimum above the maximum is dropped.
    const amountLow = group.reduce<number | null>((a, g) => lo(a, g.minAmount), null);
    const amountHigh = group.reduce<number | null>((a, g) => hi(a, g.maxAmount), null);
    return {
      productSlug,
      minAmount: amountLow !== null && amountHigh !== null && amountLow > amountHigh ? null : amountLow,
      maxAmount: amountHigh,
      minRate: group.reduce<number | null>((a, g) => lo(a, g.minRate), null),
      maxRate: group.reduce<number | null>((a, g) => hi(a, g.maxRate), null),
      minTenureMonths: group.reduce<number | null>((a, g) => lo(a, g.minTenureMonths), null),
      maxTenureMonths: group.reduce<number | null>((a, g) => hi(a, g.maxTenureMonths), null),
      rateType: group.every((g) => g.rateType === group[0]!.rateType) ? group[0]!.rateType : null,
      processingFee: [...new Set(group.map((g) => g.processingFee).filter(Boolean))].join("; ").slice(0, 200) || null,
      specialScheme: schemes.length ? [...new Set(schemes)].join(", ").slice(0, 200) : null,
      employmentTypes: [...new Set(group.flatMap((g) => g.employmentTypes))],
      // Needed only when every scheme on the flyer says so; a flyer that says "no GST needed" never sets it.
      gstRequired: group.every((g) => g.gstRequired === true),
      minCreditScore: group.reduce<number | null>((a, g) => lo(a, g.minCreditScore), null),
      allIndia: group.some((g) => g.allIndia === true),
      cities: [...new Set(group.flatMap((g) => g.cities))].slice(0, 40),
      notes: notes || null,
      schemes: group.length,
    };
  });
  return { policies, skipped, empty };
}

/** What a policy already holds, in the shapes this file works with. */
export type ExistingPolicy = {
  minAmount: number | null;
  maxAmount: number | null;
  minRate: number | null;
  maxRate: number | null;
  minTenureMonths: number | null;
  maxTenureMonths: number | null;
  rateType: string | null;
  processingFee: string | null;
  specialScheme: string | null;
  employmentTypes: string[];
  cities: string[];
  gstRequired: boolean;
  allIndia: boolean;
  minCreditScore: number | null;
  notes: string | null;
};

const rupees = (n: number) => "₹" + n.toLocaleString("en-IN");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const union = (a: string[], b: string[]) => {
  const out = [...a];
  for (const x of b) if (!out.some((y) => same(x, y))) out.push(x);
  return out;
};
const splitList = (s: string | null) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * How a newly read flyer adds to a policy that already exists. Nothing is replaced and nothing is duplicated: a range only
 * widens, a list only gains the entries it lacked, a blank is filled, and a note already recorded is not written twice.
 * `changes` says in plain words what is new, and is empty when the flyer told us nothing we did not already hold.
 */
export function mergeIntoPolicy(existing: ExistingPolicy, draft: PolicyDraft, today: string): { fields: Record<string, unknown>; changes: string[] } {
  const fields: Record<string, unknown> = {};
  const changes: string[] = [];
  const range = (label: string, loKey: "minAmount" | "minRate" | "minTenureMonths", hiKey: "maxAmount" | "maxRate" | "maxTenureMonths", show: (n: number) => string) => {
    const lowAfter = lo(existing[loKey], draft[loKey]);
    const highAfter = hi(existing[hiKey], draft[hiKey]);
    if (lowAfter !== existing[loKey] || highAfter !== existing[hiKey]) {
      if (lowAfter !== null) fields[loKey] = lowAfter;
      if (highAfter !== null) fields[hiKey] = highAfter;
      const a = lowAfter !== null ? show(lowAfter) : null;
      const b = highAfter !== null ? show(highAfter) : null;
      changes.push(`${label} now ${a && b && a !== b ? `${a} to ${b}` : (a ?? b)}`);
    }
  };
  range("amount", "minAmount", "maxAmount", rupees);
  range("rate", "minRate", "maxRate", (n) => `${n}%`);
  range("tenure", "minTenureMonths", "maxTenureMonths", (n) => `${n} months`);

  if (draft.minCreditScore !== null && (existing.minCreditScore === null || draft.minCreditScore < existing.minCreditScore)) {
    fields.minCreditScore = draft.minCreditScore;
    changes.push(`minimum credit score ${draft.minCreditScore}`);
  }
  if (!existing.rateType && draft.rateType) {
    fields.rateType = draft.rateType;
    changes.push(`rate type ${draft.rateType.toLowerCase()}`);
  }
  if (draft.processingFee && (!existing.processingFee || (!squash(existing.processingFee).includes(squash(draft.processingFee)) && existing.processingFee.length + draft.processingFee.length + 2 <= 200))) {
    fields.processingFee = existing.processingFee ? `${existing.processingFee}; ${draft.processingFee}` : draft.processingFee;
    changes.push(`processing fee: ${draft.processingFee}`);
  }
  const schemes = union(splitList(existing.specialScheme), splitList(draft.specialScheme));
  if (schemes.length > splitList(existing.specialScheme).length && schemes.join(", ").length <= 200) {
    fields.specialScheme = schemes.join(", ");
    changes.push(`schemes: ${schemes.slice(splitList(existing.specialScheme).length).join(", ")}`);
  }
  for (const key of ["employmentTypes", "cities"] as const) {
    const merged = union(existing[key], draft[key]);
    if (merged.length > existing[key].length) {
      fields[key] = merged;
      changes.push(`${key === "cities" ? "cities" : "who can apply"} added: ${merged.slice(existing[key].length).join(", ")}`);
    }
  }
  // A lender that asks for GST on one scheme but not on another does not need it on the product as a whole.
  if (existing.gstRequired && !draft.gstRequired) {
    fields.gstRequired = false;
    changes.push("GST no longer required");
  }
  if (!existing.allIndia && draft.allIndia) {
    fields.allIndia = true;
    changes.push("available all India");
  }
  if (draft.notes && !squash(existing.notes ?? "").includes(squash(draft.notes))) {
    const next = [existing.notes, `From flyer ${today}: ${draft.notes}`].filter(Boolean).join("\n");
    if (next.length <= 1000) {
      fields.notes = next;
      changes.push("new notes from the flyer (schemes, charges, documents)");
    }
  }
  return { fields, changes };
}

/** Fills only the blanks of a contact already on file; says what it filled. */
export function fillContact(
  have: { name: string | null; designation: string | null; phone: string | null; email: string | null; segments: string[] },
  incoming: OfferContact,
  segments: string[],
): { data: Record<string, unknown>; filled: string[] } {
  const data: Record<string, unknown> = {};
  const filled: string[] = [];
  const placeholder = !have.name || /^contact from flyer$/i.test(have.name);
  if (incoming.name && placeholder) { data.name = incoming.name; filled.push("name"); }
  if (incoming.designation && !have.designation) { data.designation = incoming.designation; filled.push("designation"); }
  if (incoming.phone && !have.phone) { data.phone = incoming.phone; filled.push("phone"); }
  if (incoming.email && !have.email) { data.email = incoming.email; filled.push("email"); }
  const merged = union(have.segments, segments);
  if (merged.length > have.segments.length) { data.segments = merged; filled.push("loan types"); }
  return { data, filled };
}

/** The same thing put in twice, however it is spaced or capitalised, gives the same fingerprint. */
export const normalizedForHash = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
