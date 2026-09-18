export type Role = "ADMIN" | "MANAGER" | "ADVISOR";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "DOCS_PENDING"
  | "CONVERTED"
  | "LOST";

export const LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "DOCS_PENDING",
  "CONVERTED",
  "LOST",
];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  DOCS_PENDING: "Docs pending",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export type AuthUser = { id: string; name: string; email: string; role: Role };

type Named = { id: string; name: string };

export type Lead = {
  id: string;
  leadNo: number;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  amount: string | null;
  source: string;
  status: LeadStatus;
  nextFollowUpAt: string | null;
  notes: string | null;
  createdAt: string;
  loanProduct: (Named & { slug: string }) | null;
  assignedOfficer: Named | null;
  assignedManager: Named | null;
  sourcingPartner: Named | null;
};

export type FollowUp = {
  id: string;
  note: string;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
  user: Named;
};

export type LeadDetail = Lead & {
  followUps: FollowUp[];
  application: { id: string; applicationNo: string; status: string } | null;
};

export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };

export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "BANK_LOGIN"
  | "UNDER_REVIEW"
  | "SANCTIONED"
  | "DISBURSED"
  | "REJECTED"
  | "WITHDRAWN";

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "BANK_LOGIN",
  "UNDER_REVIEW",
  "SANCTIONED",
  "DISBURSED",
  "REJECTED",
  "WITHDRAWN",
];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  BANK_LOGIN: "Bank login",
  UNDER_REVIEW: "Under review",
  SANCTIONED: "Sanctioned",
  DISBURSED: "Disbursed",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export type Applicant = {
  id: string;
  isPrimary: boolean;
  name: string;
  relation: string | null;
  phone: string | null;
  email: string | null;
  pan: string | null;
  city: string | null;
  employmentType: string | null;
  employerName: string | null;
  monthlyIncome: string | null;
  cibilScore: number | null;
};

export type Reference = {
  id: string;
  name: string;
  phone: string;
  relation: string | null;
  address: string | null;
};

export type Application = {
  id: string;
  applicationNo: string;
  status: ApplicationStatus;
  requestedAmount: string;
  tenureMonths: number | null;
  purpose: string | null;
  bankLoginAt: string | null;
  bankReferenceNo: string | null;
  createdAt: string;
  loanProduct: { id: string; name: string; slug: string } | null;
  lender: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  applicants: Applicant[];
};

export type ApplicationDetail = Application & {
  references: Reference[];
  lead: { id: string; leadNo: number; name: string; source: string } | null;
  sanction: unknown | null;
  disbursements: unknown[];
};

export type Lender = { id: string; name: string; type: "BANK" | "NBFC" };

export type SanctionStatus = "PENDING" | "APPROVED" | "REJECTED";

export const SANCTION_STATUSES: SanctionStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export const SANCTION_STATUS_LABEL: Record<SanctionStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export type Sanction = {
  id: string;
  technicalStatus: SanctionStatus;
  technicalAt: string | null;
  technicalNote: string | null;
  financialStatus: SanctionStatus;
  financialAt: string | null;
  financialNote: string | null;
  sanctionedAmount: string | null;
  interestRate: string | null;
  tenureMonths: number | null;
  sanctionLetterNo: string | null;
  validTill: string | null;
  updatedAt: string;
  application: {
    id: string;
    applicationNo: string;
    status: ApplicationStatus;
    requestedAmount: string;
    loanProduct: { id: string; name: string } | null;
    lender: { id: string; name: string } | null;
    owner: { id: string; name: string } | null;
    applicants: { name: string; phone: string | null }[];
  };
};

export type DisbursementType = "FULL" | "PART";

export type Disbursement = {
  id: string;
  type: DisbursementType;
  amount: string;
  disbursedAt: string;
  interestRate: string | null;
  runningBalance: string | null;
  utrNo: string | null;
  note: string | null;
  createdAt: string;
};

export type DisbursementSummary = {
  items: Disbursement[];
  sanctionedAmount: number;
  drawn: number;
  undrawn: number;
};

export type DisbursementRow = Disbursement & {
  application: {
    id: string;
    applicationNo: string;
    status: ApplicationStatus;
    loanProduct: { id: string; name: string } | null;
    lender: { id: string; name: string } | null;
    owner: { id: string; name: string } | null;
    applicants: { name: string }[];
  };
};
