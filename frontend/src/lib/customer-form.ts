import type { EmploymentType, ApplicantConstitution } from "./types";

const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const PHONE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type FormReference = { name: string; phone: string; relation: string; address: string };

/** Everything as the customer types it — numbers stay text until they are sent. */
export type FormValues = {
  name: string;
  email: string;
  dateOfBirth: string;
  pan: string;
  aadhaarLast4: string;
  address: string;
  city: string;
  pincode: string;
  isNRI: boolean;
  employmentType: EmploymentType | "";
  constitution: ApplicantConstitution | "";
  employerName: string;
  monthlyIncome: string;
  requestedAmount: string;
  tenureMonths: string;
  purpose: string;
  references: FormReference[];
};

/** The shape the API holds: nulls for empty, real numbers. */
export type ServerForm = {
  name?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  pan?: string | null;
  aadhaarLast4?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  isNRI?: boolean | null;
  employmentType?: EmploymentType | null;
  constitution?: ApplicantConstitution | null;
  employerName?: string | null;
  monthlyIncome?: number | null;
  requestedAmount?: number | null;
  tenureMonths?: number | null;
  purpose?: string | null;
  references?: { name: string; phone: string; relation?: string | null; address?: string | null }[] | null;
};

export const STEPS = ["About you", "Work & income", "Your loan", "References", "Documents", "Review"] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;

const text = (v: string | null | undefined) => v ?? "";
const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function fromServer(f: ServerForm): FormValues {
  return {
    name: text(f.name),
    email: text(f.email),
    dateOfBirth: text(f.dateOfBirth),
    pan: text(f.pan),
    aadhaarLast4: text(f.aadhaarLast4),
    address: text(f.address),
    city: text(f.city),
    pincode: text(f.pincode),
    isNRI: Boolean(f.isNRI),
    employmentType: f.employmentType ?? "",
    constitution: f.constitution ?? "",
    employerName: text(f.employerName),
    monthlyIncome: num(f.monthlyIncome),
    requestedAmount: num(f.requestedAmount),
    tenureMonths: num(f.tenureMonths),
    purpose: text(f.purpose),
    references: (f.references ?? []).map((r) => ({ name: r.name, phone: r.phone, relation: text(r.relation), address: text(r.address) })),
  };
}

export const digits = (s: string) => s.replace(/\D/g, "");
const blank = (s: string) => s.trim() === "";

/** The date `years` before `today` (both YYYY-MM-DD). */
export const yearsBefore = (today: string, years: number) => `${String(Number(today.slice(0, 4)) - years).padStart(4, "0")}${today.slice(4)}`;

export const isBusiness = (v: Pick<FormValues, "employmentType">) => v.employmentType === "SELF_EMPLOYED" || v.employmentType === "BUSINESS";

const validReference = (r: FormReference) => r.name.trim().length >= 2 && PHONE.test(r.phone);

/** Which step each field is on, so a problem can take the customer back to it. */
export const STEP_OF: Record<string, StepIndex> = {
  name: 0, dateOfBirth: 0, email: 0, pan: 0, aadhaarLast4: 0, address: 0, city: 0, pincode: 0,
  employmentType: 1, employerName: 1, constitution: 1, monthlyIncome: 1,
  requestedAmount: 2, tenureMonths: 2, purpose: 2,
  references: 3,
};

/** Mirrors the server's rules so mistakes show as the customer types; the server still has the final say. */
export function fieldErrors(v: FormValues, opts: { referencesRequired: number; today: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.name.trim().length < 2) e.name = "Please enter your full name";
  if (blank(v.dateOfBirth)) e.dateOfBirth = "Date of birth is required";
  else if (v.dateOfBirth > opts.today) e.dateOfBirth = "Date of birth cannot be in the future";
  else if (v.dateOfBirth > yearsBefore(opts.today, 18)) e.dateOfBirth = "You must be at least 18 years old";
  else if (v.dateOfBirth < yearsBefore(opts.today, 100)) e.dateOfBirth = "Please check the date of birth";
  if (!blank(v.email) && !EMAIL.test(v.email.trim())) e.email = "That email doesn't look right";
  if (blank(v.pan)) e.pan = "PAN is required";
  else if (!PAN.test(v.pan)) e.pan = "PAN looks like ABCDE1234F";
  if (!blank(v.aadhaarLast4) && !/^\d{4}$/.test(v.aadhaarLast4)) e.aadhaarLast4 = "Enter just the last 4 digits";
  if (blank(v.address)) e.address = "Address is required";
  if (blank(v.city)) e.city = "City is required";
  if (blank(v.pincode)) e.pincode = "Pincode is required";
  else if (!/^\d{6}$/.test(v.pincode)) e.pincode = "Pincode is 6 digits";

  if (!v.employmentType) e.employmentType = "Please choose one";
  else {
    if (v.employmentType !== "OTHER" && blank(v.employerName)) {
      e.employerName = v.employmentType === "SALARIED" ? "Employer name is required" : "Business or firm name is required";
    }
    if (isBusiness(v) && !v.isNRI && !v.constitution) e.constitution = "Please choose how your business is set up";
  }
  if (blank(v.monthlyIncome) || Number(v.monthlyIncome) <= 0) e.monthlyIncome = "Monthly income is required";

  if (blank(v.requestedAmount) || Number(v.requestedAmount) <= 0) e.requestedAmount = "Loan amount is required";
  if (!blank(v.tenureMonths) && !(Number(v.tenureMonths) >= 1 && Number(v.tenureMonths) <= 600)) e.tenureMonths = "Enter months between 1 and 600";

  if (v.references.filter(validReference).length < opts.referencesRequired) {
    e.references =
      opts.referencesRequired === 1 ? "Please give one reference with a name and a 10-digit mobile number" : `Please give ${opts.referencesRequired} references, each with a name and a 10-digit mobile number`;
  }
  return e;
}

/** The first step that still has something to fix, or null when the form is ready to send. */
export function firstStepWithProblem(errors: Record<string, string>): StepIndex | null {
  const steps = Object.keys(errors).map((k) => STEP_OF[k] ?? 0);
  return steps.length ? (Math.min(...steps) as StepIndex) : null;
}

/**
 * What to save while the customer is still typing. Anything that doesn't pass
 * the basic shape check is left out, so a half-typed PAN is simply not saved
 * yet rather than rejected; empty text clears the saved value.
 */
export function toPayload(v: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (key: string, value: string, valid: (s: string) => boolean = () => true) => {
    const t = value.trim();
    if (t === "") out[key] = null;
    else if (valid(t)) out[key] = t;
  };
  set("name", v.name, (s) => s.length >= 2);
  set("email", v.email, (s) => EMAIL.test(s));
  set("dateOfBirth", v.dateOfBirth, (s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
  set("pan", v.pan, (s) => PAN.test(s));
  set("aadhaarLast4", v.aadhaarLast4, (s) => /^\d{4}$/.test(s));
  set("address", v.address);
  set("city", v.city);
  set("pincode", v.pincode, (s) => /^\d{6}$/.test(s));
  set("employerName", v.employerName);
  set("purpose", v.purpose);
  out.isNRI = v.isNRI;
  out.employmentType = v.employmentType || null;
  out.constitution = v.constitution || null;
  const number = (key: string, value: string, min: number, max: number, whole = false) => {
    if (value.trim() === "") out[key] = null;
    else {
      const n = Number(value);
      if (Number.isFinite(n) && n >= min && n <= max && (!whole || Number.isInteger(n))) out[key] = n;
    }
  };
  number("monthlyIncome", v.monthlyIncome, 0, 1e10);
  number("requestedAmount", v.requestedAmount, 1, 1e11);
  number("tenureMonths", v.tenureMonths, 1, 600, true);
  out.references = v.references.filter(validReference).map((r) => ({
    name: r.name.trim(),
    phone: r.phone,
    ...(r.relation.trim() && { relation: r.relation.trim() }),
    ...(r.address.trim() && { address: r.address.trim() }),
  }));
  return out;
}

export const formLink = (origin: string, token: string) => `${origin}/crm/apply/${token}`;

/** A WhatsApp click-to-chat link carrying a ready message — no WhatsApp account or API needed on our side. */
export function whatsappLink(phone: string | null | undefined, message: string) {
  const d = digits(phone ?? "");
  const number = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** "120 months" → "10 years", "18" → "1 year 6 months" — a gentle check that the number typed is what was meant. */
export function tenureInWords(months: number) {
  if (!Number.isInteger(months) || months < 1) return "";
  const y = Math.floor(months / 12);
  const m = months % 12;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [y ? part(y, "year") : "", m ? part(m, "month") : ""].filter(Boolean).join(" ");
}
