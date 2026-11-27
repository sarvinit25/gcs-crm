// The lender matcher. A pure function: a customer's profile and a set of lender policy records go
// in, an explained shortlist comes out. It does not decide anything about a loan. It says which
// lenders' *recorded* rules the profile appears to fit, why, and what a person must still check.
//
// Rules it follows (from the GCS matching specification):
//  - only a policy that is active, in date and recently verified is trusted; otherwise the lender is
//    sent to a human, never matched on stale rules;
//  - hard filters (location, amount, age, property, constitution, employment) remove a lender, but
//    anything unknown goes to expert review instead of being guessed;
//  - financial / credit / property limits are lender-specific and only ever *score*; a miss routes
//    the case to a human, it does not silently exclude it;
//  - lender payout or commission is not an input, so it cannot influence a ranking.

import type { Program } from "./policy-extras";
import { applyCriteria, type Criteria, type FieldValues, type MatchFieldDef } from "./match-fields";
import { fitPrograms, type ProgramFit } from "./program-fit";

export type Band = { upTo: number | null; value: number };

export type PolicyRule = {
  id: string;
  lenderId: string;
  lenderName: string;
  active: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  lastVerifiedAt: Date | null;
  reviewEveryDays: number;
  minAmount: number | null;
  maxAmount: number | null;
  minRate: number | null;
  maxRate: number | null;
  maxTenureMonths: number | null;
  employmentTypes: string[];
  minAge: number | null;
  maxAgeAtApplication: number | null;
  maxAgeAtMaturity: number | null;
  minMonthlyIncome: number | null;
  minBusinessVintageMonths: number | null;
  minAnnualTurnover: number | null;
  minAnnualProfit: number | null;
  minCreditScore: number | null;
  acceptedConstitutions: string[];
  gstRequired: boolean;
  foirBands: Band[] | null;
  ltvBands: Band[] | null;
  acceptedPropertyTypes: string[];
  allIndia: boolean;
  cities: string[];
  /** The lender's named programs for this loan type, each judged on its own rules. */
  programs?: Program[];
  /** Tests on staff-defined match fields (see match-fields.ts). */
  criteria?: Criteria | null;
};

export type Profile = {
  amount?: number;
  city?: string;
  employmentType?: string; // SALARIED | SELF_EMPLOYED
  age?: number;
  monthlyIncome?: number;
  existingEmi?: number;
  creditScore?: number; // the low end of the range the customer gave
  propertyValue?: number;
  propertyType?: string;
  constitution?: string;
  businessVintageMonths?: number;
  annualTurnover?: number;
  annualProfit?: number;
  gstRegistered?: boolean;
  tenureMonths?: number;
  /** For a program that works out its own amount: rent and other income a month, average monthly bank balance, the agreement value and stamp duty of a purchase, and the kind of business. */
  rentalIncome?: number;
  otherIncome?: number;
  abb?: number;
  agreementValue?: number;
  stampDuty?: number;
  industry?: string;
  /** Answers to staff-defined match fields, by field key. */
  fields?: FieldValues;
  /** The loan product slug being matched, so a field can apply to some loan types only. */
  product?: string;
};

export type MatchStatus = "STRONG" | "POSSIBLE" | "EXPERT_REVIEW" | "EXCLUDED";

export type Reason = { code: string; ok: boolean; text: string };

/**
 * The three answers a customer-facing list needs (the longer status above stays for staff):
 *  ELIGIBLE: every criterion that could be checked is met, on rules someone has confirmed.
 *  CONDITIONAL: could suit, but something must be cleared first: a rule not confirmed, a detail missing or close to a limit.
 *  NOT_MATCHED: a criterion on confirmed rules is not met.
 */
export type MatchCategory = "ELIGIBLE" | "CONDITIONAL" | "NOT_MATCHED";

export type MatchResult = {
  policyId: string;
  lenderId: string;
  lenderName: string;
  status: MatchStatus;
  /** 0–100, or null when the policy could not be scored (stale, inactive, excluded). */
  score: number | null;
  reasons: Reason[];
  /** Things a GCS person must verify before this is shown to the customer. */
  checks: string[];
  /** True when the record itself needs attention (expired or not verified in time). */
  policyNeedsReview: boolean;
  /** Each named program of the lender judged on its own rules: for a person to read, never part of the score. */
  programFit?: ProgramFit[];
  /** True when something about the lender is unknown (where it serves is not recorded), so it is not ruled out or called eligible. */
  capped?: boolean;
  category?: MatchCategory;
};

/** Eligible / Conditional / Not matched, from a result. A failed criterion only rules a lender out when its rules are confirmed. */
export function categoryOf(r: Pick<MatchResult, "status" | "reasons" | "checks" | "policyNeedsReview" | "capped">): MatchCategory {
  // The price comparison is a nudge between lenders, never a criterion the customer fails.
  // "Where it serves is unknown" and "rules not re-verified" are caveats, not criteria the customer fails.
  const failed = r.reasons.some((x) => !x.ok && !["PRICING", "LOCATION_UNKNOWN", "POLICY_STALE", "OBLIGATIONS_HIGH", "FOIR_TYPICAL", "LTV_TYPICAL"].includes(x.code));
  if (r.status === "EXCLUDED") return "NOT_MATCHED";
  // A clearly failed rule rules a lender out even when its service area is unrecorded; only unconfirmed rules keep it open.
  if (failed && !r.policyNeedsReview) return "NOT_MATCHED";
  if (r.status === "STRONG" && r.checks.length === 0) return "ELIGIBLE";
  return "CONDITIONAL";
}

/** Suggested starting weights (they add up to 100). */
export const WEIGHTS = {
  eligibility: 30,
  financial: 20,
  credit: 15,
  collateral: 15,
  pricing: 10,
  processing: 5,
  documents: 5,
} as const;

const DAY = 86_400_000;
const lower = (v: string) => v.trim().toLowerCase();
const inList = (list: string[], v: string) => list.some((x) => lower(x) === lower(v));

/**
 * Lender records are typed by people ("Self-employed", "Professional", "Business", "Salaried") while a customer is SALARIED or
 * SELF_EMPLOYED. Both are brought to the same two groups before comparing, so the wording never rules a lender out.
 */
export const employmentGroup = (v: string): "SALARIED" | "SELF_EMPLOYED" | null => {
  const t = lower(v).replace(/[^a-z]/g, "");
  if (t.includes("salar")) return "SALARIED";
  if (/self|business|professional|proprietor|partner|consultant|trader/.test(t)) return "SELF_EMPLOYED";
  return null;
};
export const takesEmployment = (list: string[], v: string): boolean => {
  const want = employmentGroup(v);
  return list.some((x) => (want !== null && employmentGroup(x) === want) || lower(x) === lower(v));
};

/** Plain-words warning when running EMIs are at or near the whole income; null when it cannot be told or is fine. */
export function obligationsWarning(profile: Pick<Profile, "monthlyIncome" | "existingEmi">): string | null {
  const income = profile.monthlyIncome;
  const emis = profile.existingEmi;
  if (!income || !emis || income <= 0) return null;
  const pct = (emis / income) * 100;
  if (pct < 80) return null;
  const rs = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  return `Existing EMIs of ${rs(emis)} a month are ${Math.round(pct)}% of the monthly income of ${rs(income)}, before any new loan.`;
}

/** Towns of the Mumbai Metropolitan Region that lenders who list "Mumbai" usually serve. */
const MUMBAI_REGION = /^(navi mumbai|thane|kalyan|dombivli|dombivali|mira road|mira[- ]bhayandar|bhayandar|vasai|virar|vasai[- ]virar|nalasopara|panvel|ulhasnagar|ambernath|badlapur|diva|mumbra|bhiwandi|kharghar|airoli|vashi|belapur|nerul|ghansoli)\b/i;
export const inMumbaiRegion = (city: string) => MUMBAI_REGION.test(city.trim());

/** The usual market ceiling for all EMIs as a share of income, used only as a guide when a lender's own is not recorded. */
export const typicalFoir = (employmentType?: string) => (employmentType === "SELF_EMPLOYED" ? 65 : 60);

export const emi = (principal: number, annualRatePct: number, months: number): number => {
  if (months <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
};

/** The band that applies to a value: the first whose ceiling is at or above it (null = no ceiling). */
export const pickBand = (bands: Band[] | null, value: number): Band | null => {
  if (!bands?.length) return null;
  const sorted = [...bands].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  return sorted.find((b) => b.upTo === null || value <= b.upTo) ?? null;
};

/** Component score 0..1, or null when it cannot be judged from what is recorded / known. */
type Component = { score: number | null; failed: boolean };
const unknown: Component = { score: null, failed: false };

export function matchOne(profile: Profile, p: PolicyRule, now: Date = new Date()): MatchResult {
  const reasons: Reason[] = [];
  const checks: string[] = [];
  const base = { policyId: p.id, lenderId: p.lenderId, lenderName: p.lenderName, reasons, checks };
  // Rules that were never verified, or not recently, are still worked through so staff can see how the lender fits and why,
  // but such a lender is never shown as a Strong or Possible match and is never ruled out on rules nobody has confirmed.
  let unverified = false;
  // Something unknown about the lender (rules not verified, where it serves not recorded): the analysis is still shown, but the
  // lender is never labelled Strong or Possible.
  let capped = false;
  const out = (status: MatchStatus, score: number | null, policyNeedsReview = false): MatchResult => ({
    ...base,
    status: (unverified || capped) && status === "EXCLUDED" ? "EXPERT_REVIEW" : status,
    score,
    policyNeedsReview: unverified || policyNeedsReview,
    capped,
  });
  const note = (code: string, ok: boolean, text: string) => reasons.push({ code, ok, text });

  // ── data-quality gates ──
  if (!p.active || now < p.effectiveFrom || (p.effectiveTo && now > p.effectiveTo)) {
    note("POLICY_NOT_ACTIVE", false, "This lender's policy record is not active for today's date.");
    return out("EXCLUDED", null, true);
  }
  const verifiedAgeDays = p.lastVerifiedAt ? (now.getTime() - p.lastVerifiedAt.getTime()) / DAY : Infinity;
  if (verifiedAgeDays > p.reviewEveryDays) {
    unverified = true;
    capped = true;
    note(
      "POLICY_STALE",
      false,
      p.lastVerifiedAt
        ? `Rules were last verified ${Math.floor(verifiedAgeDays)} days ago (review every ${p.reviewEveryDays}). Treat this match as a guide only.`
        : "Rules have never been verified, so this match is a guide only and must be confirmed with the lender.",
    );
    checks.push("Confirm this lender's current rules, then mark the policy verified.");
  }

  // ── hard filters ──
  if (!p.allIndia) {
    if (p.cities.length === 0) {
      capped = true;
      note("LOCATION_UNKNOWN", false, "Where this lender serves is not recorded.");
      checks.push("Confirm the lender serves the customer's location.");
    } else if (!profile.city) {
      checks.push("Customer's city is needed to confirm serviceability.");
    } else if (!inList(p.cities, profile.city) && inMumbaiRegion(profile.city) && p.cities.some((c) => /mumbai|\bmmr\b/i.test(c))) {
      // A lender that lists Mumbai normally lends across the Mumbai region, but a person should confirm the branch.
      note("LOCATION", true, `Lists Mumbai, and ${profile.city} is in the Mumbai region.`);
      checks.push(`Confirm the lender's branch covers ${profile.city}.`);
    } else if (!inList(p.cities, profile.city)) {
      note("LOCATION", false, `Not recorded as serving ${profile.city}.`);
      return out("EXCLUDED", null);
    } else {
      note("LOCATION", true, `Serves ${profile.city}.`);
    }
  } else {
    note("LOCATION", true, "Serves all India.");
  }

  if (profile.amount !== undefined) {
    if (p.minAmount !== null && profile.amount < p.minAmount) {
      note("AMOUNT_RANGE", false, "Requested amount is below this lender's minimum.");
      return out("EXCLUDED", null);
    }
    if (p.maxAmount !== null && profile.amount > p.maxAmount) {
      note("AMOUNT_RANGE", false, "Requested amount is above this lender's maximum.");
      return out("EXCLUDED", null);
    }
    if (p.minAmount === null && p.maxAmount === null) checks.push("Lender's amount limits are not recorded.");
    else note("AMOUNT_RANGE", true, "Amount is within the lender's range.");
  }

  if (profile.age !== undefined) {
    if (p.minAge !== null && profile.age < p.minAge) {
      note("AGE", false, `Below the minimum age (${p.minAge}).`);
      return out("EXCLUDED", null);
    }
    if (p.maxAgeAtApplication !== null && profile.age > p.maxAgeAtApplication) {
      note("AGE", false, `Above the maximum age at application (${p.maxAgeAtApplication}).`);
      return out("EXCLUDED", null);
    }
    if (p.maxAgeAtMaturity !== null) {
      const months = profile.tenureMonths ?? p.maxTenureMonths;
      if (months && profile.age + months / 12 > p.maxAgeAtMaturity) {
        note("AGE", false, `Loan would run past the maximum age at maturity (${p.maxAgeAtMaturity}).`);
        return out("EXCLUDED", null);
      }
    }
    note("AGE", true, "Age is within the lender's limits.");
  }

  if (p.employmentTypes.length && profile.employmentType) {
    if (!takesEmployment(p.employmentTypes, profile.employmentType)) {
      note("EMPLOYMENT", false, "This lender does not take this applicant type for the product.");
      return out("EXCLUDED", null);
    }
  }
  if (p.acceptedConstitutions.length && profile.constitution) {
    if (!inList(p.acceptedConstitutions, profile.constitution)) {
      note("CONSTITUTION", false, `Does not accept a ${profile.constitution} for this product.`);
      return out("EXCLUDED", null);
    }
  }
  if (p.acceptedPropertyTypes.length && profile.propertyType) {
    if (!inList(p.acceptedPropertyTypes, profile.propertyType)) {
      note("PROPERTY_TYPE", false, `Does not accept ${profile.propertyType} property.`);
      return out("EXCLUDED", null);
    }
  }

  // ── scored components ──
  // Eligibility fit: the lender's own minimums.
  const elig: Component = (() => {
    const tests: boolean[] = [];
    const t = (ok: boolean, code: string, good: string, bad: string) => {
      tests.push(ok);
      note(code, ok, ok ? good : bad);
    };
    if (p.minMonthlyIncome !== null && profile.monthlyIncome !== undefined)
      t(profile.monthlyIncome >= p.minMonthlyIncome, "MIN_INCOME", "Meets the minimum income.", "Below the minimum income.");
    if (p.minBusinessVintageMonths !== null && profile.businessVintageMonths !== undefined)
      t(profile.businessVintageMonths >= p.minBusinessVintageMonths, "VINTAGE", "Meets the minimum business vintage.", "Below the minimum business vintage.");
    if (p.minAnnualTurnover !== null && profile.annualTurnover !== undefined)
      t(profile.annualTurnover >= p.minAnnualTurnover, "TURNOVER", "Meets the minimum turnover.", "Below the minimum turnover.");
    if (p.minAnnualProfit !== null && profile.annualProfit !== undefined)
      t(profile.annualProfit >= p.minAnnualProfit, "PROFIT", "Meets the minimum profit.", "Below the minimum profit.");
    if (p.gstRequired && profile.gstRegistered !== undefined)
      t(profile.gstRegistered, "GST", "GST registration is in place.", "This lender needs GST registration.");
    if (tests.length === 0) return unknown;
    const passed = tests.filter(Boolean).length;
    return { score: passed / tests.length, failed: passed < tests.length };
  })();

  // Financial fit: FOIR, using this lender's own band for the customer's income.
  const fin: Component = (() => {
    if (profile.monthlyIncome === undefined || profile.amount === undefined) return unknown;
    const band = pickBand(p.foirBands, profile.monthlyIncome);
    const rate = p.maxRate ?? p.minRate;
    const months = profile.tenureMonths ?? p.maxTenureMonths;
    if (!band) {
      // The lender's own limit is not on file: the usual market limit is shown as a guide, never as this lender's rule.
      const typical = typicalFoir(profile.employmentType);
      const guess = ((profile.existingEmi ?? 0) + emi(profile.amount, rate ?? 11, months || 180)) / profile.monthlyIncome * 100;
      note("FOIR_TYPICAL", guess <= typical, `EMIs would be about ${guess.toFixed(0)}% of income; lenders usually allow up to ${typical}% (this lender's own limit is not recorded).`);
      checks.push("This lender's income-to-EMI limit is not recorded: confirm it.");
      return unknown;
    }
    if (rate === null || !months) {
      checks.push("FOIR could not be checked (lender's rate or tenure not recorded).");
      return unknown;
    }
    const foir = ((profile.existingEmi ?? 0) + emi(profile.amount, rate, months)) / profile.monthlyIncome * 100;
    if (foir <= band.value * 0.9) {
      note("FOIR", true, `Estimated obligations ${foir.toFixed(0)}% of income, within the lender's ${band.value}%.`);
      return { score: 1, failed: false };
    }
    if (foir <= band.value) {
      note("FOIR", true, `Estimated obligations ${foir.toFixed(0)}% of income, close to the lender's ${band.value}% limit.`);
      checks.push("FOIR is close to the lender's limit.");
      return { score: 0.6, failed: false };
    }
    note("FOIR", false, `Estimated obligations ${foir.toFixed(0)}% of income, above the lender's ${band.value}%.`);
    return { score: 0, failed: true };
  })();

  // Credit policy fit: only the lender's minimum score; the rest is for a human.
  const credit: Component = (() => {
    if (p.minCreditScore === null) return unknown;
    if (profile.creditScore === undefined) {
      checks.push("Customer's credit score range is needed.");
      return unknown;
    }
    const ok = profile.creditScore >= p.minCreditScore;
    note("CREDIT", ok, ok ? "Credit range meets the lender's minimum." : "Credit range is below the lender's minimum.");
    return { score: ok ? 1 : 0, failed: !ok };
  })();

  // Property / security fit: loan-to-value against this lender's bands.
  const collateral: Component = (() => {
    if (profile.propertyValue === undefined || profile.amount === undefined) return unknown;
    const band = pickBand(p.ltvBands, profile.propertyValue);
    if (!band) {
      if (p.ltvBands === null) {
        // A guide from the usual market limits, never presented as this lender's rule.
        const typical = profile.product === "home-loan" ? 80 : 70;
        const share = (profile.amount / profile.propertyValue) * 100;
        note("LTV_TYPICAL", share <= typical, `Loan is ${share.toFixed(0)}% of the property value; lenders usually allow up to ${typical}% (this lender's own limit is not recorded).`);
        checks.push("This lender's loan-to-value limit is not recorded: confirm it.");
        return unknown;
      }
      checks.push("LTV band for this property value is not recorded.");
      return unknown;
    }
    const ltv = (profile.amount / profile.propertyValue) * 100;
    if (ltv <= band.value - 5) {
      note("LTV", true, `Loan is ${ltv.toFixed(0)}% of property value, within the lender's ${band.value}%.`);
      return { score: 1, failed: false };
    }
    if (ltv <= band.value) {
      note("LTV", true, `Loan is ${ltv.toFixed(0)}% of property value, close to the lender's ${band.value}% limit.`);
      checks.push("LTV is close to the lender's limit.");
      return { score: 0.6, failed: false };
    }
    note("LTV", false, `Loan is ${ltv.toFixed(0)}% of property value, above the lender's ${band.value}%.`);
    return { score: 0, failed: true };
  })();

  const parts: { w: number; c: Component }[] = [
    { w: WEIGHTS.eligibility, c: elig },
    { w: WEIGHTS.financial, c: fin },
    { w: WEIGHTS.credit, c: credit },
    { w: WEIGHTS.collateral, c: collateral },
  ];
  return finish(base, parts, unverified, capped);
}

/** Turns component scores into a score and a status. Pricing is added later, across lenders. */
function finish(
  base: Pick<MatchResult, "policyId" | "lenderId" | "lenderName" | "reasons" | "checks">,
  parts: { w: number; c: Component }[],
  unverified = false,
  capped = false,
): MatchResult {
  const known = parts.filter((x) => x.c.score !== null);
  const knownWeight = known.reduce((s, x) => s + x.w, 0);
  const anyFailed = parts.some((x) => x.c.failed);
  // No number from too little: one passed credit-score test must not read as 100 out of 100.
  const score = knownWeight >= 35 ? Math.round((known.reduce((s, x) => s + x.w * (x.c.score as number), 0) / knownWeight) * 100) : null;

  let status: MatchStatus;
  if (score === null) {
    status = "EXPERT_REVIEW";
    base.checks.push("Not enough about the customer or the lender's rules to score this properly.");
  } else if (anyFailed) {
    status = "EXPERT_REVIEW";
  } else if (score >= 80 && knownWeight >= 60) {
    status = "STRONG";
  } else if (score >= 60) {
    status = "POSSIBLE";
  } else {
    status = "EXPERT_REVIEW";
  }
  // Rules nobody has confirmed never earn a Strong or Possible label.
  if (capped && (status === "STRONG" || status === "POSSIBLE")) status = "EXPERT_REVIEW";
  return { ...base, status, score, policyNeedsReview: unverified, capped };
}

const RANK: Record<MatchStatus, number> = { STRONG: 0, POSSIBLE: 1, EXPERT_REVIEW: 2, EXCLUDED: 3 };

/** Runs the matcher across every policy and returns them best first. */
export function matchAll(profile: Profile, policies: PolicyRule[], now: Date = new Date(), fields: MatchFieldDef[] = []): MatchResult[] {
  const results = policies.map((p) => {
    const r = matchOne(profile, p, now);
    if (r.status !== "EXCLUDED") applyCriteria(r, p.criteria, fields, profile.fields, { product: profile.product, employmentType: profile.employmentType });
    if (p.programs?.length && r.status !== "EXCLUDED") r.programFit = fitPrograms(profile, p.programs, { rate: p.maxRate ?? p.minRate, tenureMonths: p.maxTenureMonths });
    return r;
  });

  // Pricing is relative, so it is judged across the lenders still in the running: a small nudge,
  // never a reason by itself to drop or promote a lender.
  const live = results.filter((r) => r.status === "STRONG" || r.status === "POSSIBLE");
  const mids = live
    .map((r) => {
      const p = policies.find((x) => x.id === r.policyId)!;
      return p.minRate !== null && p.maxRate !== null ? (p.minRate + p.maxRate) / 2 : null;
    })
    .filter((x): x is number => x !== null);
  if (mids.length >= 2) {
    const lo = Math.min(...mids);
    const hi = Math.max(...mids);
    for (const r of live) {
      const p = policies.find((x) => x.id === r.policyId)!;
      if (p.minRate === null || p.maxRate === null || r.score === null || hi === lo) continue;
      const mid = (p.minRate + p.maxRate) / 2;
      const pricing = (hi - mid) / (hi - lo); // 1 = cheapest
      r.score = Math.round(r.score * (1 - WEIGHTS.pricing / 100) + pricing * 100 * (WEIGHTS.pricing / 100));
      r.reasons.push({ code: "PRICING", ok: pricing >= 0.5, text: pricing >= 0.5 ? "Recorded rate is on the lower side of the shortlist." : "Recorded rate is on the higher side of the shortlist." });
    }
  }

  // A warning about the customer, not any one lender: the EMIs already running swallow the income before this loan is added.
  // It never rules a lender out (a balance transfer or consolidation can clear those EMIs) but it is shown on every lender and
  // stops any of them being called Eligible until someone has dealt with it.
  const obligations = obligationsWarning(profile);
  if (obligations) {
    for (const r of results) {
      if (r.status === "EXCLUDED") continue;
      r.reasons.push({ code: "OBLIGATIONS_HIGH", ok: false, text: obligations });
      r.checks.push("Existing EMIs already use most of the income: clear or consolidate some of them, or show more income, before applying.");
    }
  }

  for (const r of results) r.category = categoryOf(r);
  return results.sort((a, b) => RANK[a.status] - RANK[b.status] || (b.score ?? -1) - (a.score ?? -1));
}
