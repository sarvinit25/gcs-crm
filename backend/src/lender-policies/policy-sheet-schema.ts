// The "Bank Product Policy One Pager": the standard set of details GCS wants on every lender's Home Loan and Loan Against
// Property policy. One definition drives the form in the CRM, what the flyer reader is asked to find, and what is kept.
// Anything a flyer or a person does not give stays blank; nothing is guessed.

export type SheetFieldType = "text" | "longtext" | "money" | "percent" | "number" | "select" | "yesno" | "multi" | "date" | "phone" | "email";

export type SheetField = {
  key: string;
  label: string;
  type: SheetFieldType;
  options?: string[];
  /** A hint for the form, and the wording the reader is given to find it. */
  hint?: string;
};
export type SheetSection = { id: string; title: string; fields: SheetField[] };
export type SheetData = Record<string, string | number | string[] | null>;

const YN = ["Yes", "No"];
const OPEN = ["Home Loan", "Home Loan Balance Transfer", "Home Loan Top-Up", "Loan Against Property", "LAP Balance Transfer", "LAP Top-Up", "Commercial Property Purchase", "Industrial Property"];

const f = (key: string, label: string, type: SheetFieldType, extra: Partial<SheetField> = {}): SheetField => ({ key, label, type, ...extra });

export const SHEET_SECTIONS: SheetSection[] = [
  {
    id: "basic",
    title: "Basic details",
    fields: [
      f("scheme", "Scheme / product name", "text"),
      f("loginFeeHL", "Login fee, Home Loan (₹)", "money"),
      f("loginFeeLAP", "Login fee, LAP (₹)", "money"),
      f("loginMode", "Login mode", "select", { options: ["Online (Soft Copy)", "Physical File", "Either Mode", "Both Online & Physical (Both Modes)"] }),
    ],
  },
  {
    id: "amount",
    title: "Loan amount",
    fields: [
      f("hlMin", "Home Loan, from (₹)", "money"),
      f("hlMax", "Home Loan, to (₹)", "money"),
      f("lapMin", "LAP, from (₹)", "money"),
      f("lapMax", "LAP, to (₹)", "money"),
      f("cpMin", "Commercial Purchase, from (₹)", "money"),
      f("cpMax", "Commercial Purchase, to (₹)", "money"),
    ],
  },
  {
    id: "roi",
    title: "Rate of interest (ROI)",
    fields: [
      f("hlRoi", "Home Loan ROI", "text", { hint: "For example “8.75% onwards” or “8.75% to 10.5%”" }),
      f("lapRoi", "LAP ROI", "text", { hint: "For example “9.5% onwards” or a range" }),
      f("cpRoi", "Commercial Purchase ROI", "text"),
      f("roiDependsOn", "ROI depends on", "multi", { options: ["CIBIL", "Loan Amount", "Profile", "LTV", "Other"] }),
      f("roiDependsOther", "Other thing the ROI depends on", "text"),
    ],
  },
  {
    id: "fees",
    title: "Processing fees",
    fields: [
      f("pfSalHL", "Salaried Home Loan (% + GST)", "percent"),
      f("pfSepHL", "Self-employed Home Loan (% + GST)", "percent"),
      f("pfSalLAP", "Salaried LAP (% + GST)", "percent"),
      f("pfSepLAP", "Self-employed LAP (% + GST)", "percent"),
      f("pfMin", "Minimum processing fee, if any (₹)", "money"),
      f("pfMax", "Maximum processing fee / capping, if any (₹)", "money"),
    ],
  },
  {
    id: "credit",
    title: "Credit score",
    fields: [
      f("minCibil", "Minimum CIBIL score", "number"),
      f("cibilDeviation", "Below-CIBIL / credit deviation policy, if any", "longtext"),
    ],
  },
  {
    id: "topup",
    title: "Home loan top-up",
    fields: [
      f("topUpEligibility", "Top-up eligibility", "longtext"),
      f("topUpMax", "Maximum top-up amount / %", "text"),
      f("topUpUpToPct", "Top-up up to (%)", "percent"),
      f("topUpUpToBps", "ROI loading for that, in bps", "number"),
      f("topUpAbovePct", "Top-up above (%)", "percent"),
      f("topUpAboveBps", "ROI loading for that, in bps", "number"),
      f("topUpOther", "Other top-up conditions", "longtext"),
    ],
  },
  {
    id: "foir",
    title: "FOIR and income eligibility",
    fields: [
      f("foirSal", "Salaried FOIR, up to (%)", "percent"),
      f("foirSep", "Self-employed FOIR, up to (%)", "percent"),
      f("otherIncome", "Other income considered", "text"),
      f("rentalIncome", "Rental income considered", "yesno", { options: YN }),
      f("bankingProgram", "Banking-based program", "yesno", { options: YN }),
      f("lowLtvProgram", "Low-LTV program", "yesno", { options: YN }),
      f("lipProgram", "LIP program", "yesno", { options: YN }),
      f("aipProgram", "AIP / income surrogate program", "yesno", { options: YN }),
      f("otherPrograms", "Other special eligibility programs", "longtext"),
    ],
  },
  {
    id: "tenure",
    title: "Maximum loan tenure (years)",
    fields: [
      f("tenSalHL", "Salaried Home Loan", "number"),
      f("tenSepHL", "Self-employed Home Loan", "number"),
      f("tenSalLAP", "Salaried LAP", "number"),
      f("tenSepLAP", "Self-employed LAP", "number"),
      f("tenProfHL", "SEP / professional Home Loan", "number"),
      f("tenProfLAP", "SEP / professional LAP", "number"),
    ],
  },
  {
    id: "ltv",
    title: "LAP: maximum LTV (%)",
    fields: [
      f("ltvSorp", "Self-occupied residential (SORP)", "percent"),
      f("ltvRentedRes", "Rented residential", "percent"),
      f("ltvVacantRes", "Vacant residential", "percent"),
      f("ltvSocp", "Self-occupied commercial (SOCP)", "percent"),
      f("ltvRentedComm", "Rented commercial", "percent"),
      f("ltvIndustrial", "Self-occupied industrial", "percent"),
      f("ltvIndustrialOffice", "Industrial with office set-up", "percent"),
      f("ltvOther", "Other property type (%)", "percent"),
      f("ltvOtherLabel", "Which property type that is", "text"),
    ],
  },
  {
    id: "charges",
    title: "Other charges",
    fields: [
      f("legal", "Legal charges", "text", { hint: "Amount as the bank states it, for example “₹3,000 + GST”" }),
      f("technical", "Technical / valuation charges", "text"),
      f("admin", "Administrative charges", "text"),
      f("insurance", "Insurance", "select", { options: ["Mandatory", "Optional", "Not Applicable"] }),
      f("insuranceStructure", "Insurance premium / structure", "text"),
      f("mod", "MOD / mortgage charges", "text"),
      f("prepayment", "Prepayment / foreclosure charges", "text"),
      f("otherCharges", "Other charges", "longtext"),
      f("conditionalCharges", "Any other applicable or conditional charges", "longtext"),
    ],
  },
  {
    id: "open",
    title: "Products currently open",
    fields: [f("productsOpen", "Open for", "multi", { options: OPEN }), f("productsOpenOther", "Other product open", "text")],
  },
  {
    id: "special",
    title: "Special policy / USP",
    fields: [
      f("specialScheme", "Special scheme / offer", "longtext"),
      f("usp", "Key product USP", "longtext"),
      f("preferredProfile", "Preferred customer profile", "longtext"),
      f("restrictions", "Major policy restrictions", "longtext"),
      f("deviationProgram", "Any special approval / deviation program", "longtext"),
    ],
  },
  {
    id: "contact",
    title: "Contact details",
    fields: [
      f("rmName", "RM / sales manager name", "text"),
      f("rmDesignation", "Designation", "text"),
      f("rmMobile", "Mobile no.", "phone"),
      f("rmEmail", "Email ID", "email"),
      f("rmLocation", "Location / branch", "text"),
    ],
  },
  {
    id: "validity",
    title: "Validity",
    fields: [f("effectiveDate", "Policy effective date", "date"), f("validity", "Validity of the policy", "text", { hint: "For example “till 31 March 2027”" })],
  },
];

export const SHEET_FIELDS: SheetField[] = SHEET_SECTIONS.flatMap((s) => s.fields);
const BY_KEY = new Map(SHEET_FIELDS.map((x) => [x.key, x]));

const isoDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
};

/** One answer cleaned for its type; anything that does not fit becomes blank rather than an error. */
export function cleanSheetValue(field: SheetField, raw: unknown): string | number | string[] | null {
  if (field.type === "multi") {
    const list = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
    const picked = list.map((x) => String(x).trim()).map((x) => field.options?.find((o) => o.toLowerCase() === x.toLowerCase()) ?? null).filter((x): x is string => Boolean(x));
    return picked.length ? [...new Set(picked)] : null;
  }
  const str = typeof raw === "string" || typeof raw === "number" ? String(raw).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\s+/g, " ").trim() : "";
  if (!str) return null;
  switch (field.type) {
    case "text": return str.slice(0, 200);
    case "longtext": return str.slice(0, 1500);
    case "money": { const n = Number(str.replace(/[₹,]/g, "")); return Number.isFinite(n) && n >= 0 && n <= 1e12 ? Math.round(n) : null; }
    case "percent": { const n = Number(str.replace(/%/g, "")); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null; }
    case "number": { const n = Number(str.replace(/,/g, "")); return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null; }
    case "select": return field.options?.find((o) => o.toLowerCase() === str.toLowerCase()) ?? null;
    case "yesno": { const v = str.toLowerCase(); return v === "yes" ? "Yes" : v === "no" ? "No" : null; }
    case "date": return isoDate(str);
    case "phone": { const d = str.replace(/\D/g, ""); const t = d.length >= 12 && d.startsWith("91") ? d.slice(-10) : d; return t.length >= 8 && t.length <= 15 ? t : null; }
    case "email": { const e = str.toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 160 ? e : null; }
  }
}

/** Only known keys with a usable value survive: blanks are simply absent. */
export function cleanSheet(raw: unknown): SheetData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: SheetData = {};
  for (const [key, value] of Object.entries(r)) {
    const field = BY_KEY.get(key);
    if (!field) continue;
    const v = cleanSheetValue(field, value);
    if (v !== null) out[key] = v;
  }
  return out;
}

/**
 * Adds what a flyer found to what is already held, filling blanks only: a value a person (or an earlier flyer) put in is
 * never overwritten. `filled` names what was new; `kept` names what the flyer said differently, so it can be shown.
 */
export function fillSheet(existing: SheetData, found: SheetData): { data: SheetData; filled: string[]; differs: { label: string; held: string; flyer: string }[] } {
  const data: SheetData = { ...existing };
  const filled: string[] = [];
  const differs: { label: string; held: string; flyer: string }[] = [];
  const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v));
  for (const [key, value] of Object.entries(found)) {
    const field = BY_KEY.get(key);
    if (!field) continue;
    const held = data[key];
    if (held === undefined || held === null || held === "" || (Array.isArray(held) && held.length === 0)) {
      data[key] = value;
      filled.push(field.label);
    } else if (show(held) !== show(value)) {
      differs.push({ label: field.label, held: show(held), flyer: show(value) });
    }
  }
  return { data, filled, differs };
}

/** How much of the one-pager is filled, as a whole percent, and which fields are still blank. */
export function sheetProgress(data: SheetData): { percent: number; missing: string[] } {
  const missing = SHEET_FIELDS.filter((x) => { const v = data[x.key]; return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0); }).map((x) => x.label);
  return { percent: Math.round(((SHEET_FIELDS.length - missing.length) / SHEET_FIELDS.length) * 100), missing };
}

/** The list of keys and what each means, in the words given to the flyer reader. */
export function sheetPromptLines(): string {
  return SHEET_SECTIONS.flatMap((s) =>
    s.fields.map((x) => {
      const kind = x.type === "money" ? "rupees as a number" : x.type === "percent" ? "percent as a number" : x.type === "number" ? "a number" : x.type === "yesno" ? '"Yes" or "No"' : x.type === "date" ? "YYYY-MM-DD" : x.type === "multi" ? `a list from: ${x.options?.join(" | ")}` : x.type === "select" ? `one of: ${x.options?.join(" | ")}` : "short text as printed";
      return `  ${x.key}: ${s.title} - ${x.label} (${kind})`;
    }),
  ).join("\n");
}
