/**
 * The one list of every column an Excel/CSV report can contain, per register, grouped into the sections the
 * "Customize report" dialog shows. The server builds rows from these keys and serves this same catalogue to the
 * UI, so the picker, the saved templates and the export can never disagree about what a column is called.
 *
 * Pure data: nothing here touches the database, so it is cheap to test and safe to import anywhere.
 */
import { Role } from "@prisma/client";

export const RECORD_TYPES = ["leads", "applications", "sanctions", "disbursements", "commissions"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export type ColumnType = "text" | "amount" | "date" | "percent" | "number";

export type CatalogueColumn = {
  key: string;
  label: string;
  type: ColumnType;
  section: string;
  /** Part of the standard export and the on-screen report. */
  standard?: boolean;
  /** Only Admin and Manager may see this column; Staff never get it in the picker, a template or a file. */
  commission?: boolean;
};

/** What the report engine hands to the workbook builder. */
export type RecordColumn = { key: string; label: string; type: ColumnType };

export type CatalogueSection = { id: string; label: string };

export type TypeCatalogue = {
  type: RecordType;
  label: string;
  /** What one row is, for the "n records" line ("file", "lead"). */
  noun: string;
  sections: CatalogueSection[];
  columns: CatalogueColumn[];
};

type Def = [key: string, label: string, type: ColumnType, flags?: "standard" | "commission" | "standard,commission"];

/** Compact way to write a section's columns without repeating the section id on every line. */
const section = (id: string, defs: Def[]): CatalogueColumn[] =>
  defs.map(([key, label, type, flags]) => ({
    key,
    label,
    type,
    section: id,
    ...(flags?.includes("standard") && { standard: true }),
    ...(flags?.includes("commission") && { commission: true }),
  }));

const FILE_SECTIONS: CatalogueSection[] = [
  { id: "file", label: "File" },
  { id: "applicant", label: "Applicant" },
  { id: "business", label: "Business" },
  { id: "coapplicants", label: "Co-applicants and guarantors" },
  { id: "loan", label: "Loan details" },
  { id: "login", label: "Bank login" },
  { id: "sanction", label: "Sanction" },
  { id: "disbursal", label: "Disbursal" },
  { id: "commission", label: "Commission" },
];

const CATALOGUE: Record<RecordType, TypeCatalogue> = {
  applications: {
    type: "applications",
    label: "Files",
    noun: "file",
    sections: FILE_SECTIONS,
    columns: [
      ...section("file", [
        ["applicationNo", "Application no.", "text", "standard"],
        ["date", "Created", "date", "standard"],
        ["status", "Status", "text", "standard"],
        ["owner", "Owner", "text", "standard"],
        ["leadNo", "Lead ID", "text"],
        ["source", "Lead source", "text"],
        ["campaign", "Campaign", "text"],
        ["partner", "Sourcing partner", "text"],
        ["updatedAt", "Last updated", "date"],
      ]),
      ...section("applicant", [
        ["customer", "Customer", "text", "standard"],
        ["phone", "Mobile", "text", "standard"],
        ["email", "Email", "text"],
        ["dateOfBirth", "Date of birth", "date"],
        ["pan", "PAN", "text"],
        ["address", "Address", "text"],
        ["city", "City", "text"],
        ["pincode", "Pincode", "text"],
        ["nri", "NRI", "text"],
      ]),
      ...section("business", [
        ["employmentType", "Employment type", "text"],
        ["constitution", "Business constitution", "text"],
        ["employer", "Employer / business name", "text"],
        ["monthlyIncome", "Monthly income", "amount"],
        ["cibilScore", "CIBIL score", "number"],
        ["cibilScoreDate", "CIBIL report date", "date"],
      ]),
      ...section("coapplicants", [
        ["coApplicantCount", "Co-applicants / guarantors", "number"],
        ["coApplicantNames", "Names", "text"],
        ["coApplicantRelations", "Relations", "text"],
        ["coApplicantPhones", "Mobiles", "text"],
        ["coApplicantPans", "PANs", "text"],
        ["coApplicantIncome", "Combined monthly income", "amount"],
      ]),
      ...section("loan", [
        ["loanType", "Loan type", "text", "standard"],
        ["lender", "Lender", "text", "standard"],
        ["amount", "Requested amount", "amount", "standard"],
        ["tenure", "Tenure (months)", "number", "standard"],
        ["purpose", "Purpose", "text"],
      ]),
      ...section("login", [
        ["loginDate", "Bank login", "date", "standard"],
        ["bankReferenceNo", "Bank reference", "text", "standard"],
        ["bankerName", "Banker", "text"],
        ["bankerMobile", "Banker mobile", "text"],
        ["loginFees", "Login fees", "amount"],
        ["dsaChannel", "DSA channel", "text"],
      ]),
      ...section("sanction", [
        ["sanctionNo", "Sanction no.", "text"],
        ["sanctionDate", "Sanction date", "date"],
        ["sanctionedAmount", "Sanctioned amount", "amount"],
        ["sanctionRate", "Interest rate %", "percent"],
        ["sanctionTenure", "Sanctioned tenure (months)", "number"],
        ["emi", "EMI", "amount"],
        ["firstEmiDate", "First EMI", "date"],
        ["sanctionFee", "Processing fee", "amount"],
        ["letterNo", "Sanction letter", "text"],
        ["validTill", "Valid till", "date"],
        ["bankRm", "Bank RM", "text"],
        ["technical", "Technical", "text"],
        ["financial", "Financial", "text"],
        ["legal", "Legal", "text"],
      ]),
      ...section("disbursal", [
        ["disbursedAmount", "Disbursed amount", "amount"],
        ["netDisbursed", "Net disbursed", "amount"],
        ["disbursalCount", "No. of payouts", "number"],
        ["lastDisbursedOn", "Last disbursed on", "date"],
        ["disbursalMode", "Mode", "text"],
        ["utrNo", "UTR", "text"],
        ["loanAccountNo", "Loan account", "text"],
      ]),
      ...section("commission", [
        ["commissionAmount", "Gross commission", "amount", "commission"],
        ["commissionStatus", "Payout status", "text", "commission"],
        ["commissionClaimedOn", "Claimed on", "date", "commission"],
        ["commissionReceived", "Commission received", "amount", "commission"],
        ["commissionReceivedOn", "Received on", "date", "commission"],
        ["commissionExtras", "Extra commissions", "amount", "commission"],
      ]),
    ],
  },

  leads: {
    type: "leads",
    label: "Leads",
    noun: "lead",
    sections: [
      { id: "lead", label: "Lead" },
      { id: "customer", label: "Customer" },
      { id: "work", label: "Employment" },
      { id: "interest", label: "Loan interest" },
      { id: "source", label: "Source and tracking" },
      { id: "followup", label: "Follow-up" },
    ],
    columns: [
      ...section("lead", [
        ["leadNo", "Lead ID", "text", "standard"],
        ["date", "Lead date", "date", "standard"],
        ["status", "Status", "text", "standard"],
        ["officer", "Assigned to", "text", "standard"],
        ["segment", "Segment", "text"],
        ["lostReason", "Lost reason", "text", "standard"],
      ]),
      ...section("customer", [
        ["customer", "Customer", "text", "standard"],
        ["phone", "Mobile", "text", "standard"],
        ["email", "Email", "text", "standard"],
        ["city", "City", "text", "standard"],
        ["secondaryPhone", "Alternate mobile", "text"],
        ["dateOfBirth", "Date of birth", "date"],
        ["pan", "PAN", "text"],
        ["address", "Address", "text"],
        ["pincode", "Pincode", "text"],
      ]),
      ...section("work", [
        ["employmentType", "Employment type", "text"],
        ["employer", "Employer", "text"],
        ["monthlyIncome", "Monthly income", "amount"],
      ]),
      ...section("interest", [
        ["loanType", "Loan type", "text", "standard"],
        ["amount", "Loan amount", "amount", "standard"],
      ]),
      ...section("source", [
        ["channel", "Lead source", "text"],
        ["source", "Enquiry form", "text", "standard"],
        ["partner", "Sourcing partner", "text", "standard"],
        ["campaign", "Campaign", "text"],
        ["utmSource", "UTM source", "text"],
        ["utmMedium", "UTM medium", "text"],
        ["landingPage", "Landing page", "text"],
      ]),
      ...section("followup", [
        ["nextFollowUp", "Next follow-up", "date"],
        ["followUpCount", "Contacts made", "number"],
      ]),
    ],
  },

  sanctions: {
    type: "sanctions",
    label: "Sanctions",
    noun: "sanction",
    sections: [
      { id: "file", label: "File" },
      { id: "sanction", label: "Sanction" },
      { id: "approvals", label: "Approvals" },
      { id: "disbursal", label: "Disbursal" },
    ],
    columns: [
      ...section("file", [
        ["applicationNo", "Application no.", "text", "standard"],
        ["customer", "Customer", "text", "standard"],
        ["loanType", "Loan type", "text", "standard"],
        ["lender", "Lender", "text", "standard"],
        ["owner", "Owner", "text"],
        ["source", "Lead source", "text"],
        ["partner", "Sourcing partner", "text"],
        ["date", "Updated", "date", "standard"],
      ]),
      ...section("sanction", [
        ["sanctionNo", "Sanction no.", "text", "standard"],
        ["sanctionDate", "Sanction date", "date", "standard"],
        ["amount", "Sanctioned amount", "amount", "standard"],
        ["rate", "Interest rate %", "percent", "standard"],
        ["tenure", "Tenure (months)", "number"],
        ["emi", "EMI", "amount", "standard"],
        ["firstEmiDate", "First EMI", "date", "standard"],
        ["processingFee", "Processing fee", "amount", "standard"],
        ["letterNo", "Sanction letter", "text", "standard"],
        ["validTill", "Valid till", "date", "standard"],
        ["bankRm", "Bank RM", "text", "standard"],
      ]),
      ...section("approvals", [
        ["technical", "Technical", "text", "standard"],
        ["financial", "Financial", "text", "standard"],
        ["legal", "Legal", "text", "standard"],
      ]),
      ...section("disbursal", [
        ["disbursalStatus", "Disbursal status", "text"],
        ["disbursedAmount", "Disbursed so far", "amount"],
      ]),
    ],
  },

  disbursements: {
    type: "disbursements",
    label: "Disbursals",
    noun: "disbursal",
    sections: [
      { id: "file", label: "File" },
      { id: "disbursal", label: "Disbursal" },
      { id: "charges", label: "Charges" },
      { id: "payment", label: "Payment" },
    ],
    columns: [
      ...section("file", [
        ["applicationNo", "Application no.", "text", "standard"],
        ["customer", "Customer", "text", "standard"],
        ["loanType", "Loan type", "text", "standard"],
        ["lender", "Lender", "text", "standard"],
        ["owner", "Owner", "text"],
        ["source", "Lead source", "text"],
        ["partner", "Sourcing partner", "text"],
      ]),
      ...section("disbursal", [
        ["date", "Disbursed on", "date", "standard"],
        ["type", "Type", "text", "standard"],
        ["amount", "Amount", "amount", "standard"],
        ["rate", "ROI %", "percent", "standard"],
        ["roiType", "ROI type", "text", "standard"],
        ["loanAccountNo", "Loan account", "text", "standard"],
        ["utrNo", "UTR", "text", "standard"],
        ["runningBalance", "Balance still to draw", "amount"],
      ]),
      ...section("charges", [
        ["processingFee", "Processing fee", "amount", "standard"],
        ["insurance", "Insurance", "amount"],
        ["documentation", "Documentation charges", "amount"],
        ["stampDuty", "Stamp duty", "amount"],
        ["otherDeductions", "Other deductions", "amount"],
        ["netAmount", "Net disbursed", "amount", "standard"],
      ]),
      ...section("payment", [
        ["mode", "Mode", "text", "standard"],
        ["bankName", "Beneficiary bank", "text", "standard"],
        ["accountNo", "Account no.", "text", "standard"],
        ["ifsc", "IFSC", "text", "standard"],
      ]),
    ],
  },

  commissions: {
    type: "commissions",
    label: "Commissions",
    noun: "commission",
    sections: [
      { id: "file", label: "File" },
      { id: "commission", label: "Commission" },
      { id: "receipt", label: "Claim and receipt" },
      { id: "shares", label: "Extras and splits" },
    ],
    columns: [
      ...section("file", [
        ["applicationNo", "Application no.", "text", "standard,commission"],
        ["date", "Disbursed on", "date", "standard,commission"],
        ["customer", "Customer", "text", "standard,commission"],
        ["loanType", "Loan type", "text", "standard,commission"],
        ["lender", "Lender", "text", "standard,commission"],
        ["owner", "Owner", "text", "standard,commission"],
        ["source", "Lead source", "text", "commission"],
        ["partner", "Sourcing partner", "text", "commission"],
      ]),
      ...section("commission", [
        ["disbursed", "Disbursed amount", "amount", "standard,commission"],
        ["rate", "Gross rate %", "percent", "standard,commission"],
        ["amount", "Gross commission", "amount", "standard,commission"],
        ["status", "Payout status", "text", "standard,commission"],
      ]),
      ...section("receipt", [
        ["claimedAt", "Claimed on", "date", "standard,commission"],
        ["receivedAmount", "Received", "amount", "standard,commission"],
        ["receivedAt", "Received on", "date", "standard,commission"],
        ["receivedRef", "Received reference", "text", "commission"],
      ]),
      ...section("shares", [
        ["extras", "Extra commissions", "text", "standard,commission"],
        ["splits", "Split between", "text", "standard,commission"],
      ]),
    ],
  },
};

/** Staff must never see commission figures; Admin and Manager see everything. */
export const canSeeCommission = (role: Role) => role !== Role.ADVISOR;

export const isRecordType = (value: string): value is RecordType => (RECORD_TYPES as readonly string[]).includes(value);

/** Every column of one register that this role may see, in catalogue order. */
export function columnsFor(type: RecordType, role: Role): CatalogueColumn[] {
  const all = CATALOGUE[type].columns;
  return canSeeCommission(role) ? all : all.filter((c) => !c.commission);
}

/** The catalogue as the UI needs it: only what this role may see, with empty sections dropped. */
export function catalogueFor(role: Role): Record<RecordType, TypeCatalogue & { standardColumns: string[] }> {
  const out = {} as Record<RecordType, TypeCatalogue & { standardColumns: string[] }>;
  for (const type of RECORD_TYPES) {
    const columns = columnsFor(type, role);
    out[type] = {
      ...CATALOGUE[type],
      columns,
      sections: CATALOGUE[type].sections.filter((s) => columns.some((c) => c.section === s.id)),
      standardColumns: columns.filter((c) => c.standard).map((c) => c.key),
    };
  }
  return out;
}

export const standardKeys = (type: RecordType, role: Role) =>
  columnsFor(type, role)
    .filter((c) => c.standard)
    .map((c) => c.key);

/**
 * Turns whatever was asked for into the columns to build, in the order asked: unknown keys, repeats and
 * columns this role may not see are dropped. With nothing asked for at all, it is the standard set; a custom
 * list that ends up empty stays empty, for the caller to report as an error.
 */
export function resolveColumns(type: RecordType, role: Role, wanted: readonly string[] | undefined | null): CatalogueColumn[] {
  const allowed = new Map(columnsFor(type, role).map((c) => [c.key, c]));
  if (!wanted) return [...allowed.values()].filter((c) => c.standard);
  const seen = new Set<string>();
  const picked: CatalogueColumn[] = [];
  for (const key of wanted) {
    const col = allowed.get(key);
    if (col && !seen.has(key)) {
      seen.add(key);
      picked.push(col);
    }
  }
  return picked;
}

/** Keys in `wanted` that this role may not use — for rejecting a template rather than silently trimming it. */
export function disallowedKeys(type: RecordType, role: Role, wanted: readonly string[]): { unknown: string[]; forbidden: string[] } {
  const visible = new Set(columnsFor(type, role).map((c) => c.key));
  const every = new Set(CATALOGUE[type].columns.map((c) => c.key));
  return {
    unknown: wanted.filter((k) => !every.has(k)),
    forbidden: wanted.filter((k) => every.has(k) && !visible.has(k)),
  };
}

export const toRecordColumn = (c: CatalogueColumn): RecordColumn => ({ key: c.key, label: c.label, type: c.type });

export const typeLabel = (type: RecordType) => CATALOGUE[type].label;
