// Reading the documents a customer sends: what kind of document it is, the figures on it, and what could go into the
// CAM. The AI only reads; everything it returns is cleaned here and in cam-fill.ts before it is used, and it only ever
// fills CAM boxes that are still blank.

import type { StatementAnalysis } from "../cam/statement-analyse";
import { camFromExtraction } from "./cam-fill";

/** Identity papers (Aadhaar, PAN, passport) are never sent to the AI. The customer types those numbers themselves. */
export const NEVER_READ_CATEGORIES = ["KYC"];

export const DOC_TYPES = ["SALARY_SLIP", "BANK_STATEMENT", "ITR", "FORM_16", "GST_RETURN", "BUSINESS_PROOF", "PROPERTY_PAPER", "LOAN_STATEMENT", "SANCTION_LETTER", "OTHER"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type ReadField = { label: string; value: string };
export type CamPatch = Record<string, Record<string, unknown>>;
export type Reading = { docType: DocType | "IDENTITY_DOCUMENT"; summary: string | null; fields: ReadField[]; cam: CamPatch | null; person?: string | null };

export const DOC_TYPE_LABEL: Record<string, string> = {
  SALARY_SLIP: "Salary slip",
  BANK_STATEMENT: "Bank statement",
  ITR: "Income tax return",
  FORM_16: "Form 16",
  GST_RETURN: "GST return",
  BUSINESS_PROOF: "Business proof",
  PROPERTY_PAPER: "Property paper",
  LOAN_STATEMENT: "Existing loan statement",
  SANCTION_LETTER: "Sanction or disbursal letter",
  IDENTITY_DOCUMENT: "Identity document",
  OTHER: "Other",
};

export function readingPrompt(): string {
  return `You read one document that a loan applicant sent to Growth Capital Services, a loan DSA in Mumbai. It may be a PDF, a scan or a phone photo, in English, Hindi or Marathi. Return one JSON object and nothing else.

{
 "docType": one of ${DOC_TYPES.map((d) => `"${d}"`).join(" | ")} | "IDENTITY_DOCUMENT",
 "summary": one plain sentence on what the document is and whose it is,
 "person": the name of the one person or firm whose income, business or loan this document is about, or null,
 "fields": [ { "label": "...", "value": "..." } ],
 "salary": { "employer": text or null, "designation": text or null, "grossMonthly": number or null, "netMonthly": number or null },
 "business": { "businessName": text, "constitution": "Proprietorship" | "Partnership" | "Private Limited" | "LLP" | "Other", "gstin": text, "udyam": text },
 "financials": [ { "year": "2024-25", "turnover": number, "grossProfit": number, "netProfit": number, "depreciation": number, "interestPaid": number, "remuneration": number, "tax": number } ],
 "property": { "agreementValue": number, "marketValue": number, "address": text, "builderName": text, "areaSqft": number, "ownerName": text },
 "loans": [ { "lender": text, "type": "Home loan" | "Loan against property" | "Car loan" | "Personal loan" | "Business loan" | "Gold loan" | "Education loan" | "Two-wheeler / consumer" | "Other", "sanctioned": number, "outstanding": number, "emi": number, "monthsLeft": number } ]
}

Leave out any of "business", "financials", "property" and "loans" that the document does not state. "year" is the financial year (the year before the assessment year). "netProfit" is the business profit; use a negative number for a loss.

Rules:
- If the document is an Aadhaar card, PAN card, passport, voter ID or driving licence: set docType to "IDENTITY_DOCUMENT", fields to [] and do not copy any number from it.
- "fields" holds only what is printed, as printed, 4 to 20 short items. Never guess a figure; leave it out when it is not there.
- Salary slip: name, employer, designation, month, gross and net pay, deductions, PF. Fill "salary" from it (monthly rupees as numbers; null when not stated).
- Bank statement: bank, account holder, account type, period covered, opening and closing balance, average monthly credits and debits if you can work them out, regular salary credits, loan EMIs seen, any returned or bounced entries. Leave "salary" with nulls.
- Income tax return or Form 16: assessment year, name, gross total income, taxable income, tax paid, and business turnover and profit if shown.
- GST return: period, turnover, tax paid.
- Existing loan statement (LOAN_STATEMENT): a statement of account of a loan that is already running. Lender, loan type, sanctioned amount, outstanding, EMI, rate, remaining tenure, any overdue.
- A sanction letter, key fact statement, disbursal advice, demand letter for a loan or in-principle approval is SANCTION_LETTER, never an existing loan statement: do not give "loans" for it.
- Never include full account numbers or card numbers: show only the last 4 digits.
- Amounts in rupees as plain numbers without commas or symbols inside "value" unless a unit is needed.`;
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};
const money = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[₹,\s]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 && n < 1e10 ? Math.round(n) : null;
};
/** Anything that looks like a long account, card or Aadhaar number is cut to its last four digits. */
export const maskLongNumbers = (s: string) => s.replace(/\b\d[\d -]{8,}\d\b/g, (m) => `XXXX${m.replace(/\D/g, "").slice(-4)}`);

/** Which structured parts each kind of document may fill: a bank statement or an unknown paper fills nothing this way. */
const MAY_FILL: Partial<Record<DocType, string[]>> = {
  ITR: ["business", "financials"],
  GST_RETURN: ["business"],
  BUSINESS_PROOF: ["business"],
  PROPERTY_PAPER: ["property"],
  LOAN_STATEMENT: ["loans"],
};

/** The AI's answer, cleaned: a known type, short readable fields, and a CAM patch limited to what that kind of document proves. */
export function normaliseReading(raw: unknown): Reading {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = typeof r.docType === "string" ? r.docType.toUpperCase() : "";
  const docType: Reading["docType"] = type === "IDENTITY_DOCUMENT" ? "IDENTITY_DOCUMENT" : (DOC_TYPES as readonly string[]).includes(type) ? (type as DocType) : "OTHER";
  if (docType === "IDENTITY_DOCUMENT") return { docType, summary: "An identity document. It is not read by the AI: the customer types those numbers themselves.", fields: [], cam: null };

  const fields: ReadField[] = [];
  for (const f of Array.isArray(r.fields) ? r.fields : []) {
    const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    const label = clean(o.label, 60);
    const value = clean(o.value, 200);
    if (label && value) fields.push({ label, value: maskLongNumbers(value) });
    if (fields.length >= 24) break;
  }

  let cam: CamPatch | null = null;
  if (docType === "SALARY_SLIP") {
    const s = (r.salary && typeof r.salary === "object" ? r.salary : {}) as Record<string, unknown>;
    const income: Record<string, unknown> = {};
    const employer = clean(s.employer, 120);
    const designation = clean(s.designation, 80);
    const gross = money(s.grossMonthly);
    const net = money(s.netMonthly);
    if (employer) income.employer = employer;
    if (designation) income.designation = designation;
    if (gross) income.grossMonthly = gross;
    if (net) income.netMonthly = net;
    if (Object.keys(income).length) cam = { income };
  }
  const parts = MAY_FILL[docType] ?? [];
  if (parts.length) cam = camFromExtraction(Object.fromEntries(parts.map((k) => [k, r[k]])));
  return { docType, summary: clean(r.summary, 300), fields, cam, person: clean(r.person, 120) };
}

const inr = (n: number | null) => (n === null ? null : `₹${Math.round(n).toLocaleString("en-IN")}`);

/** A statement read on our own server, as the same kind of field list the AI produces. */
export function statementFields(a: StatementAnalysis): ReadField[] {
  const out: ReadField[] = [
    { label: "Period", value: `${a.from} to ${a.to} (${a.monthsFound} month${a.monthsFound === 1 ? "" : "s"})` },
    { label: "Transactions read", value: String(a.transactions) },
  ];
  const opening = inr(a.openingBalance);
  const closing = inr(a.closingBalance);
  if (opening) out.push({ label: "Opening balance", value: opening });
  if (closing) out.push({ label: "Closing balance", value: closing });
  if (a.months.length) {
    const avg = a.months.reduce((s, m) => s + m.credits, 0) / a.months.length;
    out.push({ label: "Average monthly credits", value: inr(avg)! });
  }
  if (a.salary.times > 0) out.push({ label: "Salary credits", value: `${a.salary.times} times${a.salary.averagePerMonth ? `, about ${inr(a.salary.averagePerMonth)} a month` : ""}` });
  for (const e of a.emis.slice(0, 6)) out.push({ label: "EMI seen", value: `${e.label}: ${inr(e.amount)} × ${e.times}` });
  if (a.returns.inward + a.returns.outward > 0) out.push({ label: "Returned cheques / debits", value: `${a.returns.inward} inward, ${a.returns.outward} outward` });
  for (const w of a.warnings.slice(0, 3)) out.push({ label: "Note", value: w });
  return out;
}
