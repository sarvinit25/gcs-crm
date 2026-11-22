// Judges a customer against each of a lender's named programs, one by one, using that program's OWN rules.
// A lender is not one rulebook: Bandhan's Low LTV program and its Income program ask for different things.
// This only informs a person (which program looks right, and by how much the others are missed). It never changes a
// lender's score or status, and anything it cannot judge is said plainly instead of guessed.

import type { Program, RuleStatus } from "./policy-extras";
import { emi, type Profile } from "./policy-matcher";
import { indicativeAmount, type Indicative } from "./program-eligibility";

export type ProgramFit = {
  name: string;
  /** FITS: nothing misses and nothing is unknown. MAYBE: nothing misses but something is not known yet. MISSES: at least one rule is missed. */
  verdict: "FITS" | "MAYBE" | "MISSES";
  /** What matches. */
  ok: string[];
  /** What is missed, with by how much. */
  gaps: string[];
  /** What a person still needs to find out from the customer. */
  needs: string[];
  /** Rules of this program the lender has not confirmed yet. */
  unconfirmed: string[];
  /** An indicative loan amount from this program's own method, when it has one. */
  indicative: Indicative | null;
};

const rupee = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);
const has = (list: string[], v: string) => list.some((x) => x.trim().toLowerCase() === v.trim().toLowerCase());

const CORE_LABEL: Record<string, string> = {
  maxFoirPct: "Maximum FOIR",
  maxLtvPct: "Maximum LTV",
  abbMultiple: "ABB multiple",
  minBusinessVintageMonths: "Minimum business vintage",
  minCreditScore: "Minimum credit score",
};

export function fitProgram(profile: Profile, p: Program, fallback: { rate: number | null; tenureMonths: number | null }): ProgramFit {
  const ok: string[] = [];
  const gaps: string[] = [];
  const needs: string[] = [];

  if (profile.amount !== undefined) {
    if (p.maxAmount !== null && profile.amount > p.maxAmount) gaps.push(`Amount is ${rupee(profile.amount - p.maxAmount)} above this program's maximum of ${rupee(p.maxAmount)}.`);
    else if (p.minAmount !== null && profile.amount < p.minAmount) gaps.push(`Amount is ${rupee(p.minAmount - profile.amount)} below this program's minimum of ${rupee(p.minAmount)}.`);
    else if (p.maxAmount !== null || p.minAmount !== null) ok.push("Amount is within this program's range.");
  }
  if (profile.tenureMonths !== undefined && p.maxTenureMonths !== null) {
    if (profile.tenureMonths > p.maxTenureMonths) gaps.push(`Tenure is ${profile.tenureMonths - p.maxTenureMonths} months longer than the ${p.maxTenureMonths} allowed.`);
    else ok.push("Tenure is allowed.");
  }
  if (profile.age !== undefined) {
    if (p.minAge !== null && profile.age < p.minAge) gaps.push(`Age is below this program's minimum of ${p.minAge}.`);
    else if (p.maxAge !== null && profile.age > p.maxAge) gaps.push(`Age is above this program's maximum of ${p.maxAge}.`);
  }
  if (p.employmentTypes.length) {
    if (!profile.employmentType) needs.push("Whether the customer is salaried or self-employed.");
    else if (!has(p.employmentTypes, profile.employmentType)) gaps.push(`This program is for ${p.employmentTypes.join(" / ").replace(/_/g, "-").toLowerCase()} applicants only.`);
    else ok.push("Applicant type is accepted.");
  }
  if (p.propertyTypes.length) {
    if (!profile.propertyType) needs.push("The type of property.");
    else if (!has(p.propertyTypes, profile.propertyType)) gaps.push(`This program does not take ${profile.propertyType} property (it takes ${p.propertyTypes.join(", ")}).`);
    else ok.push("Property type is accepted.");
  }
  if (p.maxLtvPct !== null) {
    if (profile.propertyValue === undefined || profile.amount === undefined) needs.push("Property value and the amount wanted, to check LTV.");
    else {
      const ltv = (profile.amount / profile.propertyValue) * 100;
      if (ltv > p.maxLtvPct) gaps.push(`Loan is ${ltv.toFixed(0)}% of property value; this program allows ${p.maxLtvPct}%, so about ${rupee(profile.amount - (p.maxLtvPct / 100) * profile.propertyValue)} too much.`);
      else ok.push(`LTV ${ltv.toFixed(0)}% is within ${p.maxLtvPct}%.`);
    }
  }
  if (p.maxFoirPct !== null) {
    const rate = p.maxRate ?? p.minRate ?? fallback.rate;
    const months = profile.tenureMonths ?? p.maxTenureMonths ?? fallback.tenureMonths;
    if (profile.monthlyIncome === undefined || profile.amount === undefined) needs.push("Monthly income and the amount wanted, to check FOIR.");
    else if (rate === null || !months) needs.push("This program's rate or tenure, to check FOIR.");
    else {
      const foir = (((profile.existingEmi ?? 0) + emi(profile.amount, rate, months)) / profile.monthlyIncome) * 100;
      if (foir > p.maxFoirPct) gaps.push(`Estimated obligations are ${foir.toFixed(0)}% of income; this program allows ${p.maxFoirPct}%.`);
      else ok.push(`FOIR about ${foir.toFixed(0)}% is within ${p.maxFoirPct}%.`);
    }
  }
  if (p.minBusinessVintageMonths !== null) {
    if (profile.businessVintageMonths === undefined) needs.push("How long the business has been running.");
    else if (profile.businessVintageMonths < p.minBusinessVintageMonths) gaps.push(`Business is ${p.minBusinessVintageMonths - profile.businessVintageMonths} months short of the ${p.minBusinessVintageMonths} needed.`);
    else ok.push("Business vintage is enough.");
  }
  if (p.minCreditScore !== null) {
    if (profile.creditScore === undefined) needs.push("The customer's credit score.");
    else if (profile.creditScore < p.minCreditScore) gaps.push(`Credit score is ${p.minCreditScore - profile.creditScore} points below the ${p.minCreditScore} needed.`);
    else ok.push("Credit score is enough.");
  }
  // Rules that need figures the profile never holds are listed for a person, never skipped silently.
  if (p.abbMultiple !== null) needs.push(`Average bank balance of at least ${p.abbMultiple}× the EMI (needs the bank statements).`);
  if (p.occupancy) needs.push(`Property occupancy: ${p.occupancy}.`);
  for (const r of p.rules) if (r.status !== "NOT_APPLICABLE") needs.push(`${r.label}: ${r.value}.`);

  const unconfirmed: string[] = [];
  for (const [k, st] of Object.entries(p.status) as [string, RuleStatus][]) if (st === "PENDING") unconfirmed.push(CORE_LABEL[k] ?? k);
  for (const r of p.rules) if (r.status === "PENDING") unconfirmed.push(r.label);

  return { name: p.name, verdict: gaps.length ? "MISSES" : needs.length ? "MAYBE" : "FITS", ok, gaps, needs, unconfirmed, indicative: indicativeAmount(profile, p, fallback) };
}

const ORDER = { FITS: 0, MAYBE: 1, MISSES: 2 } as const;

/** Every program judged, best fit first. Empty when the lender has no named programs. */
export function fitPrograms(profile: Profile, programs: Program[], fallback: { rate: number | null; tenureMonths: number | null }): ProgramFit[] {
  return programs
    .map((p) => fitProgram(profile, p, fallback))
    .sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || a.gaps.length - b.gaps.length);
}
