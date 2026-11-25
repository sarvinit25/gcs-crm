// Builds the profile the lender match works from out of everything known about a lead: its own fields, and what the customer
// said in the WhatsApp chat or the website's second form. Before this the match panel only read old website-advisor notes, so
// most leads started with an empty profile and matched on almost nothing.
//
// Cautious on purpose: a band ("700 to 749") becomes the low end of the band, never a precise figure; anything not clearly
// stated is left out, and the match then says it is unknown instead of guessing.

import { parseMoney } from "../whatsapp/intake/intake.engine";
import type { Profile } from "./policy-matcher";

export type LeadForProfile = {
  amount?: unknown;
  city?: string | null;
  employmentType?: string | null;
  monthlyIncome?: unknown;
  answers?: { label: string; value: string }[];
};

const num = (v: unknown): number | undefined => {
  const n = v === null || v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** The first number in a band such as "3 to 5 years" or "Up to 5 years", and the last (the ceiling). */
function bandNumbers(text: string): number[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** Business age in months, from the low end of a band; "Less than 2 years" is taken as half the ceiling. */
function bandMonths(text: string): number | undefined {
  const n = bandNumbers(text);
  if (!n.length) return undefined;
  if (/less than|below|under/i.test(text)) return Math.round((n[0]! * 12) / 2);
  return Math.round(n[0]! * 12);
}

/**
 * Fills what the lead's own fields and answers do not say from the CAM, where staff enter the credit figures. It only fills
 * blanks: anything already known from the lead is kept.
 */
export function fillProfileFromCam(profile: Profile, cam: unknown, today: Date = new Date()): Profile {
  const data = (cam && typeof cam === "object" ? cam : {}) as Record<string, Record<string, unknown> | undefined>;
  const out: Profile = { ...profile };
  const set = <K extends keyof Profile>(key: K, value: Profile[K] | undefined) => {
    if (out[key] === undefined && value !== undefined) out[key] = value;
  };
  set("propertyValue", num(data.property?.marketValue) ?? num(data.property?.agreementValue));
  set("agreementValue", num(data.property?.agreementValue));
  set("creditScore", num(data.obligations?.cibilScore));
  const loans = Array.isArray(data.obligations?.loans) ? (data.obligations!.loans as Record<string, unknown>[]) : [];
  const running = loans.filter((l) => l && String(l.status ?? "Live") === "Live" && String(l.foir ?? "Yes") !== "No").reduce((s, l) => s + (num(l.emi) ?? 0), 0);
  set("existingEmi", running > 0 ? running : undefined);
  const dob = String(data.applicant?.dob ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const b = new Date(`${dob}T00:00:00Z`);
    let age = today.getUTCFullYear() - b.getUTCFullYear();
    if (today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate())) age -= 1;
    set("age", age);
  }
  const constitution = String(data.income?.constitution ?? "").trim();
  set("constitution", constitution || undefined);
  const years = num(data.income?.vintageYears);
  set("businessVintageMonths", years !== undefined ? Math.round(years * 12) : undefined);
  const turnover = Array.isArray(data.income?.financials) ? num((data.income!.financials as Record<string, unknown>[])[0]?.turnover) : undefined;
  set("annualTurnover", turnover);
  return out;
}

export function profileFromLead(lead: LeadForProfile): Profile {
  const by = new Map<string, string>();
  for (const a of lead.answers ?? []) {
    const v = (a.value ?? "").trim();
    if (v && !/^Not (sure|given)/i.test(v)) by.set(a.label.trim().toLowerCase(), v);
  }
  const get = (...starts: string[]): string | undefined => {
    for (const start of starts) {
      const s = start.toLowerCase();
      for (const [k, v] of by) if (k.startsWith(s)) return v;
    }
    return undefined;
  };
  const money = (...starts: string[]) => {
    const v = get(...starts);
    const n = v ? parseMoney(v) : null;
    return n && n > 0 ? n : undefined;
  };

  const p: Profile = {};
  const amount = num(lead.amount);
  if (amount) p.amount = amount;
  if (lead.city?.trim()) p.city = lead.city.trim();
  if (lead.employmentType === "SALARIED" || lead.employmentType === "SELF_EMPLOYED") p.employmentType = lead.employmentType;
  const income = num(lead.monthlyIncome);
  if (income) p.monthlyIncome = income;

  const emi = money("Total EMIs you pay every month", "What is your total existing EMI", "Total repayments the business makes every month");
  if (emi) p.existingEmi = emi;

  const cibil = get("Roughly what is your CIBIL");
  if (cibil) {
    if (/750/.test(cibil)) p.creditScore = 750;
    else if (/700/.test(cibil)) p.creditScore = 700;
    else if (/650/.test(cibil) && !/below/i.test(cibil)) p.creditScore = 650;
    else if (/below 650/i.test(cibil)) p.creditScore = 600;
  }

  const value = money("Approximate market value of the property", "Approximate market value today", "Approximate market value");
  if (value) p.propertyValue = value;
  const agreement = money("Property price / agreement value");
  if (agreement) p.agreementValue = agreement;

  const ptype = get("Type of property", "What kind of property?");
  if (ptype) {
    const m = /^(residential|commercial|industrial|mixed|plot|land)/i.exec(ptype);
    if (m) p.propertyType = m[1]!.toLowerCase() === "land" ? "Plot / land" : m[1]!.replace(/^./, (c) => c.toUpperCase());
  }

  const constitution = get("How is your business set up?", "How is your business or practice set up?", "How is your enterprise set up?");
  if (constitution) p.constitution = constitution;

  const turnover = money("Annual turnover");
  if (turnover) p.annualTurnover = turnover;
  const profit = money("Net profit as shown");
  if (profit) p.annualProfit = profit;

  const vintage = get("How long has the business been running?", "Years in the business or profession", "How long has it been running?");
  const months = vintage ? bandMonths(vintage) : undefined;
  if (months) p.businessVintageMonths = months;

  const gst = get("Is your business registered under GST?");
  if (gst) p.gstRegistered = /^yes/i.test(gst) ? true : /^no/i.test(gst) ? false : undefined;

  const period = get("Preferred repayment period");
  if (period && !/not sure/i.test(period)) {
    const n = bandNumbers(period);
    if (n.length) p.tenureMonths = Math.round(n[n.length - 1]! * 12);
  }

  const rent = money("Rent you receive every month");
  if (rent) p.rentalIncome = rent;
  const other = money("Other regular monthly income");
  if (other) p.otherIncome = other;

  const age = get("Your age");
  if (age) {
    const n = bandNumbers(age);
    if (/below|under/i.test(age) && n.length) p.age = Math.max(18, n[0]! - 2);
    else if (/above|over/i.test(age) && n.length) p.age = n[0]! + 2;
    else if (n.length >= 2) p.age = Math.round((n[0]! + n[1]!) / 2);
    else if (n.length === 1) p.age = n[0]!;
  }

  const kind = get("Industry", "What does your business do?", "What does your enterprise do?");
  if (kind) {
    if (/manufactur|factory|fabricat|production/i.test(kind)) p.industry = "Manufacturing";
    else if (/trad|retail|wholesale|shop|distribut|dealer/i.test(kind)) p.industry = "Trading";
    else if (/service|consult|clinic|software|agency|transport|logistic/i.test(kind)) p.industry = "Service";
  }
  return p;
}
