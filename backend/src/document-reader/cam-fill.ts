// Putting what was read on documents into the CAM. Two rules keep it safe: a figure is cleaned before it is used, and it only
// ever fills a box that is still blank, so nothing a person typed is ever replaced.

import type { CamPatch } from "./document-reading";

type Row = Record<string, unknown>;

const text = (v: unknown, max = 160): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return t && !/^(null|n\/?a|not (stated|available|shown)|-+)$/i.test(t) ? t.slice(0, max) : null;
};
const amount = (v: unknown, allowNegative = false): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[₹,\s]/g, "")) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) >= 1e10) return null;
  return n > 0 || (allowNegative && n < 0) ? Math.round(n) : null;
};
const pick = (source: Row, spec: Record<string, "text" | "amount" | "signed">): Row => {
  const out: Row = {};
  for (const [key, kind] of Object.entries(spec)) {
    const v = kind === "text" ? text(source[key]) : amount(source[key], kind === "signed");
    if (v !== null) out[key] = v;
  }
  return out;
};
const obj = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const oneOf = (v: unknown, options: string[]) => options.find((o) => o.toLowerCase() === String(v ?? "").trim().toLowerCase()) ?? null;

const LOAN_TYPES = ["Home loan", "Loan against property", "Car loan", "Personal loan", "Business loan", "Gold loan", "Education loan", "Two-wheeler / consumer", "Other"];
const CONSTITUTIONS = ["Proprietorship", "Partnership", "Private Limited", "LLP", "Other"];

/** The CAM patch from the structured part of the AI's answer; null when it holds nothing usable. */
export function camFromExtraction(raw: unknown): CamPatch | null {
  const r = obj(raw);
  const patch: CamPatch = {};
  const income = pick(obj(r.business), { businessName: "text", gstin: "text", udyam: "text" });
  // Registration numbers have a fixed shape; "No" or a sentence is not one.
  if (income.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]{3}$/i.test(String(income.gstin).replace(/\s/g, ""))) delete income.gstin;
  if (income.udyam && !/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/i.test(String(income.udyam).replace(/\s/g, ""))) delete income.udyam;
  const constitution = oneOf(obj(r.business).constitution, CONSTITUTIONS);
  if (constitution) income.constitution = constitution;

  // One row per financial year, as printed on the return or the accounts.
  const years = (Array.isArray(r.financials) ? r.financials : [])
    .map((y) => {
      const row = pick(obj(y), { turnover: "amount", grossProfit: "signed", netProfit: "signed", depreciation: "amount", interestPaid: "amount", remuneration: "amount", tax: "amount" });
      const year = /^(\d{4})\s*-\s*(\d{2}|\d{4})$/.exec(String(obj(y).year ?? "").trim());
      return year && Object.keys(row).length ? { year: `${year[1]}-${year[2]!.slice(-2)}`, ...row } : null;
    })
    .filter((x): x is Row & { year: string } => x !== null)
    .slice(0, 3);
  if (years.length) income.financials = years;
  if (Object.keys(income).length) patch.income = income;

  const property = pick(obj(r.property), { agreementValue: "amount", marketValue: "amount", address: "text", builderName: "text", areaSqft: "amount", ownerName: "text" });
  if (Object.keys(property).length) patch.property = property;

  const loans = (Array.isArray(r.loans) ? r.loans : [])
    .map((l) => {
      const row = pick(obj(l), { lender: "text", sanctioned: "amount", outstanding: "amount", emi: "amount", monthsLeft: "amount" });
      if (!row.lender || !row.emi) return null;
      return { ...row, type: oneOf(obj(l).type, LOAN_TYPES) ?? "Other", status: "Live" };
    })
    .filter((x) => x !== null)
    .slice(0, 6);
  if (loans.length) patch.obligations = { loans };
  return Object.keys(patch).length ? patch : null;
}

/** A file name that says it is a letter about a loan being given, not a statement of one already running. */
export const isNewLoanPaper = (fileName: string) => /sanction|\bsl\b|disburs|key ?fact|\bkfs\b|in.?principle|demand letter|login/i.test(fileName.replace(/_/g, " "));

const words = (v: string) =>
  v.toLowerCase().replace(/\b(zz|test|mr|mrs|ms|miss|shri|smt|dr|m\/s)\b\.?/g, " ").replace(/[^a-z ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);

/**
 * Whether a document is about the applicant and not a co-applicant or relative. The first name decides (a spouse often carries the
 * applicant's name as a middle name and surname); a firm matches when it shares the applicant's business or employer words. With
 * no name on the document there is nothing to judge by, so it is accepted.
 */
export function belongsToApplicant(person: string | null | undefined, applicantNames: (string | null | undefined)[], firms: (string | null | undefined)[]): boolean {
  const who = words(person ?? "");
  if (!who.length) return true;
  const first = applicantNames.map((n) => words(n ?? "")[0]).filter(Boolean);
  if (first.includes(who[0])) return true;
  const generic = new Set(["and", "the", "general", "store", "stores", "enterprises", "enterprise", "services", "private", "limited", "ltd", "pvt", "company"]);
  return firms.some((f) => {
    const own = words(f ?? "").filter((w) => !generic.has(w));
    return own.length > 0 && own.filter((w) => who.includes(w)).length >= Math.min(2, own.length);
  });
}

const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * What to save so that only blanks are filled. Financial years merge by year (missing cells of a known year are filled, new
 * years added, newest first); a loan is added only when no loan from that lender with that EMI is listed. Other tables, such as
 * bank months, are filled only while empty. Returns the patch and the names of what it fills.
 */
export function onlyBlanks(existing: unknown, patch: CamPatch): { patch: CamPatch; filled: string[] } {
  const data = obj(existing);
  const out: CamPatch = {};
  const filled: string[] = [];
  const put = (section: string, key: string, value: unknown) => {
    (out[section] ||= {})[key] = value;
    filled.push(`${section}.${key}`);
  };
  for (const [section, fields] of Object.entries(patch)) {
    const have = obj(data[section]);
    for (const [key, value] of Object.entries(fields)) {
      const current = have[key];
      if (key === "financials" && Array.isArray(value)) {
        const rows = (Array.isArray(current) ? (current as Row[]) : []).filter((x) => x && Object.values(x).some((v) => !blank(v))).map((x) => ({ ...x }));
        let changed = false;
        for (const y of value as Row[]) {
          const hit = rows.find((x) => same(x.year, y.year));
          if (!hit) {
            rows.push({ ...y });
            changed = true;
          } else
            for (const [k, v] of Object.entries(y))
              if (blank(hit[k])) {
                hit[k] = v;
                changed = true;
              }
        }
        if (changed) put(section, key, rows.sort((a, b) => String(b.year ?? "").localeCompare(String(a.year ?? ""))).slice(0, 3));
      } else if (key === "loans" && Array.isArray(value)) {
        const rows = (Array.isArray(current) ? (current as Row[]) : []).filter((x) => x && !blank(x.lender));
        const added = (value as Row[]).filter((n) => !rows.some((x) => same(x.lender, n.lender) && Number(x.emi) === Number(n.emi)));
        if (added.length) put(section, key, [...rows, ...added].slice(0, 12));
      } else if (blank(current) && !blank(value)) put(section, key, value);
    }
  }
  return { patch: out, filled };
}
