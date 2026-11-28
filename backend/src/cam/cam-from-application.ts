// Once a lead has become an application, the newer details are on the application: the CIBIL score, co-applicants, running
// loans, documents, references and the sanction. The CAM takes them into its blank boxes when it is read, so nobody types them
// twice. What a person has already written in the CAM is never replaced.

import type { CamData } from "./cam-schema";

type D = Date | null | undefined;
export type CamApplicant = {
  isPrimary: boolean;
  name: string;
  relation?: string | null;
  dateOfBirth?: D;
  phone?: string | null;
  email?: string | null;
  pan?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  employmentType?: string | null;
  constitution?: string | null;
  employerName?: string | null;
  monthlyIncome?: unknown;
  cibilScore?: number | null;
  cibilScoreDate?: D;
};
export type CamApplication = {
  tenureMonths?: number | null;
  purpose?: string | null;
  applicants: CamApplicant[];
  existingLoans: { lenderName: string; loanType?: string | null; outstanding?: unknown; emi: unknown; monthsLeft?: number | null; counted: boolean }[];
  references: { name: string; phone: string; relation?: string | null }[];
  documents: { category: string; fileName: string }[];
  sanction?: { interestRate?: unknown; tenureMonths?: number | null } | null;
};

type Row = Record<string, unknown>;
const blank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const num = (v: unknown): number | undefined => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) || Number(v) <= 0 ? undefined : Number(v));
const day = (d: D) => (d ? d.toISOString().slice(0, 10) : undefined);
/** Only the blank boxes of a row or section are filled. */
const fill = (into: Row, from: Row): Row => {
  const out = { ...into };
  for (const [k, v] of Object.entries(from)) if (blank(out[k]) && !blank(v)) out[k] = v;
  return out;
};
const list = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]).filter(Boolean) : []);
const key = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const PROFILE: Record<string, string> = { SALARIED: "Salaried", PROFESSIONAL: "Self-employed professional", BUSINESS: "Self-employed business", SELF_EMPLOYED: "Self-employed business" };
const FIRM: Record<string, string> = { PROPRIETORSHIP: "Proprietorship", PARTNERSHIP: "Partnership", PRIVATE_LIMITED: "Private Limited", LLP: "LLP" };
const LOAN_TYPES = ["Home loan", "Loan against property", "Car loan", "Personal loan", "Business loan", "Gold loan", "Education loan", "Two-wheeler / consumer"];
const loanType = (t: string | null | undefined) => (t ? (LOAN_TYPES.find((x) => key(t).startsWith(key(x)) || key(x).startsWith(key(t))) ?? "Other") : undefined);

/** The document-checklist line a filed document answers, judged by its name and then its kind. */
export function checklistName(category: string, fileName: string): string {
  const n = `${fileName} ${category}`.toLowerCase().replace(/[_-]+/g, " ");
  const rules: [RegExp, string][] = [
    [/\bpan\b/, "PAN card"],
    [/aadh?a+r/, "Aadhaar card"],
    [/photo/, "Passport-size photographs"],
    [/electric|light bill|e bill|address proof/, "Address proof, residence"],
    [/salary slip|pay ?slip/, "Salary slips, last 3 months"],
    [/bank statement|statement of account/, "Bank statements, last 6 to 12 months"],
    [/balance sheet|p&l|computation|audit/, "Computation of income, balance sheet and P&L, last 2 to 3 years"],
    [/\bitr\b|form ?16|income proof/, "Form 16 / ITR, last 2 to 3 years"],
    [/\bgst/, "GST registration and returns"],
    [/udyam|shop act|partnership|\bmoa\b|\bllp\b|business proof/, "Business proof: shop act, Udyam, partnership deed, MOA / AOA"],
    [/sanction|\bsoa\b|loan statement/, "Existing loan statements and sanction letters"],
    [/agreement|sale deed|\bafs\b/, "Property: sale deed / agreement"],
    [/property/, "Property: title documents and search report"],
  ];
  return rules.find(([r]) => r.test(n))?.[1] ?? "Other";
}

export function camFromApplication(data: CamData, app: CamApplication): CamData {
  const out: CamData = { ...data };
  const section = (id: string, values: Row) => {
    out[id] = fill(out[id] ?? {}, values);
  };
  const main = app.applicants.find((a) => a.isPrimary) ?? app.applicants[0];
  const others = app.applicants.filter((a) => a !== main);

  if (main) {
    section("applicant", { dob: day(main.dateOfBirth), pan: main.pan, address: main.address, city: main.city, pincode: main.pincode, email: main.email });
    const profile = main.employmentType ? PROFILE[main.employmentType] : undefined;
    section("income", { profile });
    const isSalaried = out.income?.profile === "Salaried";
    section("income", isSalaried
      ? { employer: main.employerName, netMonthly: num(main.monthlyIncome) }
      : { businessName: main.employerName, constitution: main.constitution ? FIRM[main.constitution] : undefined, declaredMonthly: num(main.monthlyIncome) });
    section("obligations", { cibilScore: main.cibilScore ?? undefined, cibilDate: day(main.cibilScoreDate) });
  }

  section("loanRequest", {
    tenureYears: num(app.sanction?.tenureMonths ?? app.tenureMonths) ? Math.round(((app.sanction?.tenureMonths ?? app.tenureMonths) as number) / 1.2) / 10 : undefined,
    purpose: app.purpose,
  });

  if (others.length) {
    const rows = list(out.loanRequest?.coApplicants).map((r) => ({ ...r }));
    for (const a of others) {
      const row: Row = {
        name: a.name,
        relation: a.relation,
        dob: day(a.dateOfBirth),
        pan: a.pan,
        profile: a.employmentType ? PROFILE[a.employmentType] : undefined,
        monthlyIncome: num(a.monthlyIncome),
        cibil: a.cibilScore ?? undefined,
      };
      const i = rows.findIndex((r) => key(r.name) === key(a.name));
      if (i >= 0) rows[i] = fill(rows[i]!, row);
      else rows.push(fill({}, row));
    }
    out.loanRequest = { ...(out.loanRequest ?? {}), coApplicant: "Yes", coApplicants: rows.slice(0, 5) };
  }

  if (app.existingLoans.length) {
    const rows = list(out.obligations?.loans).map((r) => ({ ...r }));
    const taken = new Set<number>();
    for (const l of app.existingLoans) {
      const type = loanType(l.loanType);
      const row: Row = { lender: l.lenderName, type, outstanding: num(l.outstanding), emi: num(l.emi), monthsLeft: l.monthsLeft ?? undefined, foir: l.counted ? "Yes" : "No", status: "Live" };
      // The same loan: same lender, and neither the EMI nor the type says otherwise.
      const same = (r: Row, i: number) => !taken.has(i) && key(r.lender) === key(l.lenderName) && (num(r.emi) === undefined || num(r.emi) === num(l.emi)) && (blank(r.type) || !type || r.type === type);
      const i = rows.findIndex(same);
      if (i >= 0) {
        rows[i] = fill(rows[i]!, row);
        taken.add(i);
      } else {
        taken.add(rows.length);
        rows.push(fill({}, row));
      }
    }
    out.obligations = { ...(out.obligations ?? {}), loans: rows.slice(0, 12) };
  }

  if (app.references.length && !list(out.references?.people).length) {
    section("references", { people: app.references.slice(0, 3).map((r) => fill({}, { name: r.name, relation: r.relation, phone: r.phone })) });
  }

  if (app.documents.length && !list(out.documents?.list).length) {
    section("documents", { list: app.documents.slice(0, 40).map((d) => ({ document: checklistName(d.category, d.fileName), who: main?.name, status: "Received", remark: d.fileName.slice(0, 200) })) });
  }

  // Once the lender has sanctioned, the figures are worked at its rate and not at our assumption.
  const rate = num(app.sanction?.interestRate);
  if (rate) section("remarks", { assumedRate: rate });
  return out;
}
