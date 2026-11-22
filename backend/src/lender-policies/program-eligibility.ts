// An INDICATIVE loan amount for one program of one lender, from that program's own method. It shows every limit it used and
// takes the lowest, because a loan is capped by whichever of income, program maximum and property is smallest.
//
// It is a calculation for a person to read and check against the lender, never an approval. A program whose method the lender
// has not confirmed (marked so on the program) gets no figure at all, only the reason.

import type { Program } from "./policy-extras";
import type { Profile } from "./policy-matcher";

export type Indicative = {
  /** The lowest of the limits that could be worked out, or null when no figure can honestly be given. */
  amount: number | null;
  /** Each limit that was worked out, in rupees. */
  parts: { label: string; amount: number }[];
  /** What was used, or why there is no figure. */
  note: string;
};

const rupee = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);

/** The loan that a monthly instalment can carry, at a yearly rate over a number of months. */
export function principalFor(monthlyEmi: number, annualRatePct: number, months: number): number {
  if (monthlyEmi <= 0 || months <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return monthlyEmi * months;
  const f = Math.pow(1 + r, months);
  return (monthlyEmi * (f - 1)) / (r * f);
}

const norm = (s: string) => s.trim().toLowerCase();

export function indicativeAmount(profile: Profile, p: Program, fallback: { rate: number | null; tenureMonths: number | null }): Indicative | null {
  const calc = p.calc;
  if (!calc) return null;
  const parts: { label: string; amount: number }[] = [];
  const need = (what: string): Indicative => ({ amount: null, parts, note: `Needs ${what} to work out a figure.` });
  const finish = (note: string): Indicative => {
    if (p.maxAmount !== null) parts.push({ label: "program maximum", amount: p.maxAmount });
    return { amount: parts.length ? Math.min(...parts.map((x) => x.amount)) : null, parts, note };
  };

  const rate = p.maxRate ?? p.minRate ?? fallback.rate;
  const months = profile.tenureMonths ?? p.maxTenureMonths ?? fallback.tenureMonths;

  // The instalment the person can carry becomes a loan amount; the property caps it by LTV where the program states one.
  const fromEmi = (capacity: number, label: string): boolean => {
    if (rate === null || !months) return false;
    parts.push({ label, amount: Math.max(0, principalFor(capacity, rate, months)) });
    return true;
  };
  const propertyCap = () => {
    if (p.maxLtvPct !== null && profile.propertyValue !== undefined) parts.push({ label: `property (${p.maxLtvPct}% of its value)`, amount: (p.maxLtvPct / 100) * profile.propertyValue });
  };

  if (calc.method === "income" || calc.method === "turnover-margin") {
    if (p.maxFoirPct === null) return { amount: null, parts, note: "The program's FOIR is not recorded, so no figure is given." };
    let monthly: number;
    let how: string;
    if (calc.method === "income") {
      if (profile.monthlyIncome === undefined) return need("the monthly income");
      const rent = ((calc.rentalPct ?? 0) / 100) * (profile.rentalIncome ?? 0);
      const other = ((calc.otherPct ?? 0) / 100) * (profile.otherIncome ?? 0);
      monthly = profile.monthlyIncome + rent + other;
      how = `income ${rupee(monthly)} a month (rent counted at ${calc.rentalPct ?? 0}%, other income at ${calc.otherPct ?? 0}%)`;
    } else {
      if (profile.annualTurnover === undefined) return need("the yearly turnover");
      if (!profile.industry) return need("the type of business (service, manufacturing or trading)");
      const margin = Object.entries(calc.margins ?? {}).find(([k]) => norm(k) === norm(profile.industry!))?.[1];
      if (margin === undefined) return { amount: null, parts, note: `This program has no margin recorded for "${profile.industry}".` };
      monthly = (profile.annualTurnover * (margin / 100)) / 12;
      how = `turnover × ${margin}% margin = ${rupee(monthly)} a month`;
    }
    const capacity = (monthly * p.maxFoirPct) / 100 - (profile.existingEmi ?? 0);
    if (!fromEmi(capacity, `income (${p.maxFoirPct}% FOIR)`)) return need("this program's rate and tenure");
    propertyCap();
    return finish(`Uses ${how}, ${p.maxFoirPct}% FOIR, and existing EMIs of ${rupee(profile.existingEmi ?? 0)}.`);
  }

  if (calc.method === "purchase") {
    if (profile.agreementValue === undefined) return need("the agreement value");
    if (profile.propertyValue === undefined) return need("the market value of the property");
    const base = profile.agreementValue + (calc.stampDutyInBase ? (profile.stampDuty ?? 0) : 0);
    parts.push({ label: `${calc.agreementPct ?? 0}% of agreement value${calc.stampDutyInBase ? " plus stamp duty" : ""}`, amount: ((calc.agreementPct ?? 0) / 100) * base });
    parts.push({ label: `${calc.marketPct ?? 0}% of market value`, amount: ((calc.marketPct ?? 0) / 100) * profile.propertyValue });
    return finish("Funding is the lower of the two property-based limits. Income and repayment capacity are not checked here.");
  }

  if (calc.method === "abb-emi") {
    if (profile.abb === undefined) return need("the average monthly bank balance");
    // "ABB to EMI greater than 1": the EMI has to stay below the average balance.
    if (!fromEmi(profile.abb, "average balance (EMI kept below it)")) return need("this program's rate and tenure");
    propertyCap();
    return finish("The EMI is kept at or below the average monthly balance. The bank's exact measure of ABB is not confirmed.");
  }

  return null;
}
