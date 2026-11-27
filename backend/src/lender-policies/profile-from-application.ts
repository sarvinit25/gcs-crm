// The lender match for an application reads what is on the file now: its applicants, the credit evaluation and the running
// loans. These are newer and more exact than what the enquiry said, so wherever the application states something, it wins.

import type { Profile } from "./policy-matcher";

export type ApplicationForProfile = {
  requestedAmount?: unknown;
  tenureMonths?: number | null;
  applicants: {
    isPrimary: boolean;
    city?: string | null;
    employmentType?: string | null;
    constitution?: string | null;
    dateOfBirth?: Date | null;
    monthlyIncome?: unknown;
    cibilScore?: number | null;
  }[];
  creditEvaluation?: {
    loanAmount?: unknown;
    tenureMonths?: number | null;
    monthlyIncome?: unknown;
    annualTurnover?: unknown;
    netProfit?: unknown;
    propertyValue?: unknown;
  } | null;
  existingLoans?: { emi?: unknown; counted: boolean }[];
};

const num = (v: unknown): number | undefined => {
  const n = v === null || v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function profileFromApplication(app: ApplicationForProfile, base: Profile = {}, today: Date = new Date()): Profile {
  const out: Profile = { ...base };
  const set = <K extends keyof Profile>(key: K, value: Profile[K] | undefined) => {
    if (value !== undefined) out[key] = value;
  };
  const main = app.applicants.find((a) => a.isPrimary) ?? app.applicants[0];
  const ev = app.creditEvaluation;

  set("amount", num(ev?.loanAmount) ?? num(app.requestedAmount));
  set("tenureMonths", ev?.tenureMonths ?? app.tenureMonths ?? undefined);
  set("city", main?.city?.trim() || undefined);
  set("employmentType", main?.employmentType === "SALARIED" ? "SALARIED" : main?.employmentType ? "SELF_EMPLOYED" : undefined);
  set("creditScore", main?.cibilScore ?? undefined);
  if (main?.constitution) set("constitution", main.constitution.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()));
  if (main?.dateOfBirth) {
    const b = main.dateOfBirth;
    let age = today.getUTCFullYear() - b.getUTCFullYear();
    if (today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate())) age -= 1;
    set("age", age);
  }
  // The credit evaluation's income when a person set one; otherwise every applicant's income added up, as lenders do.
  const together = app.applicants.reduce((s, a) => s + (num(a.monthlyIncome) ?? 0), 0);
  set("monthlyIncome", num(ev?.monthlyIncome) ?? (together > 0 ? together : undefined));
  if (app.existingLoans?.length) out.existingEmi = app.existingLoans.filter((l) => l.counted).reduce((s, l) => s + (num(l.emi) ?? 0), 0);
  set("propertyValue", num(ev?.propertyValue));
  set("annualTurnover", num(ev?.annualTurnover));
  set("annualProfit", num(ev?.netProfit));
  return out;
}
