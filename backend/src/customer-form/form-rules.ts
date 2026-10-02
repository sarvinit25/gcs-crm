import { ApplicantConstitution, EmploymentType } from "@prisma/client";

export type FormReference = { name: string; phone: string; relation?: string | null; address?: string | null };

/** Everything the customer can fill in. Dates are plain YYYY-MM-DD; the phone is fixed and not part of the form. */
export type FormData = {
  name?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  pan?: string | null;
  aadhaarLast4?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  employmentType?: EmploymentType | null;
  constitution?: ApplicantConstitution | null;
  isNRI?: boolean | null;
  employerName?: string | null;
  monthlyIncome?: number | null;
  requestedAmount?: number | null;
  tenureMonths?: number | null;
  purpose?: string | null;
  references?: FormReference[] | null;
};

export const FORM_FIELDS = [
  "name", "email", "dateOfBirth", "pan", "aadhaarLast4", "address", "city", "pincode", "employmentType",
  "constitution", "isNRI", "employerName", "monthlyIncome", "requestedAmount", "tenureMonths", "purpose", "references",
] as const;

/** Later values win; an explicit null clears a field; fields the patch doesn't mention are kept. */
export function mergeForm(base: FormData, patch: FormData): FormData {
  const out: Record<string, unknown> = { ...base };
  for (const key of FORM_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && (patch as Record<string, unknown>)[key] !== undefined) {
      out[key] = (patch as Record<string, unknown>)[key];
    }
  }
  return out as FormData;
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** A reference only counts when it has a name and a phone number. */
export const completeReferences = (refs: FormReference[] | null | undefined) =>
  (refs ?? []).filter((r) => !blank(r.name) && !blank(r.phone));

/** The date `years` before `today` (both YYYY-MM-DD), used for the age check. */
export function yearsBefore(today: string, years: number) {
  return `${String(Number(today.slice(0, 4)) - years).padStart(4, "0")}${today.slice(4)}`;
}

/**
 * What is still missing or wrong before the form can be sent in, keyed by field.
 * Empty when it is complete. `today` is the India calendar day (YYYY-MM-DD).
 */
export function formProblems(form: FormData, opts: { referencesRequired: number; today: string }): Record<string, string> {
  const problems: Record<string, string> = {};
  const need = (field: keyof FormData, label: string) => {
    if (blank(form[field])) problems[field] = `${label} is required`;
  };

  need("name", "Your name");
  need("dateOfBirth", "Date of birth");
  need("pan", "PAN");
  need("address", "Address");
  need("city", "City");
  need("pincode", "Pincode");
  need("employmentType", "What you do for work");
  need("monthlyIncome", "Monthly income");
  need("requestedAmount", "Loan amount");

  if (!problems.dateOfBirth) {
    const dob = String(form.dateOfBirth);
    if (dob > opts.today) problems.dateOfBirth = "Date of birth cannot be in the future";
    else if (dob > yearsBefore(opts.today, 18)) problems.dateOfBirth = "You must be at least 18 years old";
    else if (dob < yearsBefore(opts.today, 100)) problems.dateOfBirth = "Please check the date of birth";
  }

  const works = form.employmentType && form.employmentType !== EmploymentType.OTHER;
  if (works && blank(form.employerName)) {
    problems.employerName =
      form.employmentType === EmploymentType.SALARIED ? "Employer name is required" : "Business or firm name is required";
  }
  const business = form.employmentType === EmploymentType.SELF_EMPLOYED || form.employmentType === EmploymentType.BUSINESS;
  if (business && !form.isNRI && blank(form.constitution)) problems.constitution = "Please choose how your business is set up";

  if (completeReferences(form.references).length < opts.referencesRequired) {
    problems.references =
      opts.referencesRequired === 1 ? "Please give one reference" : `Please give ${opts.referencesRequired} references`;
  }
  return problems;
}
