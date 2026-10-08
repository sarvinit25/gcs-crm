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

export const LOST_REASONS = [
  "Not interested",
  "Not eligible",
  "Non-contactable",
  "Wrong number",
  "Went with another lender",
  "Loan no longer needed",
  "Other",
];

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword?: boolean;
  twoFactorEnabled?: boolean;
};

/** Display names only — the underlying Role values (ADMIN/MANAGER/ADVISOR)
 * are unchanged in the database and in every permission check. */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Super Admin",
  MANAGER: "Admin",
  ADVISOR: "Staff",
};

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
  lostReason: string | null;
  archivedAt: string | null;
  employmentType: EmploymentType | null;
  monthlyIncome: string | null;
  meetingMode: string | null;
  meetingPlace: string | null;
  channel: string | null;
  campaign: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingPage: string | null;
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

export type EmploymentType = "SALARIED" | "SELF_EMPLOYED" | "PROFESSIONAL" | "BUSINESS" | "OTHER";

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  SALARIED: "Salaried",
  SELF_EMPLOYED: "Self-employed",
  PROFESSIONAL: "Professional",
  BUSINESS: "Business",
  OTHER: "Other",
};

export type ApplicantConstitution = "PROPRIETORSHIP" | "PARTNERSHIP" | "PRIVATE_LIMITED" | "LLP" | "OTHER";

export const CONSTITUTION_LABEL: Record<ApplicantConstitution, string> = {
  PROPRIETORSHIP: "Proprietorship",
  PARTNERSHIP: "Partnership",
  PRIVATE_LIMITED: "Private Limited",
  LLP: "LLP",
  OTHER: "Other",
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
  employmentType: EmploymentType | null;
  constitution: ApplicantConstitution | null;
  isNRI: boolean;
  employerName: string | null;
  monthlyIncome: string | null;
  cibilScore: number | null;
};

export type ChecklistApplicantType =
  | "SALARIED"
  | "PROFESSIONAL"
  | "PROPRIETORSHIP"
  | "PARTNERSHIP"
  | "PRIVATE_LIMITED"
  | "LLP"
  | "NRI";

export const CHECKLIST_APPLICANT_TYPE_LABEL: Record<ChecklistApplicantType, string> = {
  SALARIED: "Salaried",
  PROFESSIONAL: "Professional",
  PROPRIETORSHIP: "Proprietorship",
  PARTNERSHIP: "Partnership",
  PRIVATE_LIMITED: "Private Limited",
  LLP: "LLP",
  NRI: "NRI",
};

export type ChecklistItemStatus = "GIVEN" | "PENDING";

export type ApplicationChecklist = {
  bucket: ChecklistApplicantType | null;
  items: { id: string; label: string; category: string; status: ChecklistItemStatus }[];
  total: number;
  given: number;
};

export type ChecklistItem = {
  id: string;
  loanProductId: string | null;
  loanProduct: { id: string; name: string } | null;
  applicantType: ChecklistApplicantType | null;
  label: string;
  category: string;
  sortOrder: number;
  active: boolean;
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
  bankerName: string | null;
  bankerMobile: string | null;
  loginFees: string | null;
  dsaChannel: string | null;
  portalAccessCode: string | null;
  archivedAt: string | null;
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
  legalStatus: SanctionStatus;
  legalAt: string | null;
  legalNote: string | null;
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

export type PayoutStatus = "PENDING" | "PARTIAL" | "PAID";

export type CommissionSplit = {
  id: string;
  stakeholderRole: string | null;
  sharePercent: string;
  amount: string;
  status: PayoutStatus;
  paidAt: string | null;
  user: Named | null;
  sourcingPartner: Named | null;
};

export type Commission = {
  id: string;
  disbursementId: string;
  grossRate: string;
  grossAmount: string;
  status: PayoutStatus;
  receivedAt: string | null;
  createdAt: string;
  splits: CommissionSplit[];
};

export type RoiType = "FIXED" | "FLOATING";

export const ROI_TYPE_LABEL: Record<RoiType, string> = { FIXED: "Fixed Rate", FLOATING: "Floating Rate" };

export type Disbursement = {
  id: string;
  type: DisbursementType;
  amount: string;
  disbursedAt: string;
  interestRate: string | null;
  roiType: RoiType | null;
  loanAccountNo: string | null;
  runningBalance: string | null;
  utrNo: string | null;
  processingFee: string | null;
  insuranceAmount: string | null;
  documentationCharges: string | null;
  stampDuty: string | null;
  note: string | null;
  createdAt: string;
  commission?: Commission | null;
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

export type CommissionRow = Omit<Commission, "disbursementId"> & {
  disbursement: {
    id: string;
    amount: string;
    disbursedAt: string;
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
};

export type EducationLoanParent = {
  contactIndia?: string;
  contactAbroad?: string;
  currentAddress?: string;
  permanentAddress?: string;
  yearsAtCurrentAddress?: number;
  personalEmail?: string;
  qualification?: string;
  officeName?: string;
  officeAddress?: string;
  designation?: string;
  officeEmail?: string;
  totalExpYears?: number;
  currentCompanyExpYears?: number;
};

export type EducationLoanFriendReference = { name?: string; address?: string; phone?: string };

export type EducationLoanDetails = {
  student?: {
    email?: string;
    currentAddress?: string;
    permanentAddress?: string;
    yearsAtCurrentAddress?: number;
  };
  father?: EducationLoanParent;
  mother?: EducationLoanParent;
  paternalGrandmotherName?: string;
  maternalGrandmotherName?: string;
  friendReferences?: EducationLoanFriendReference[];
  course?: {
    loanAmount?: number;
    courseName?: string;
    courseDuration?: string;
    courseStartDate?: string;
    universityName?: string;
    country?: string;
  };
};

export type EducationLoanDetailRecord = {
  id: string;
  applicationId: string;
  details: EducationLoanDetails;
  updatedAt: string;
} | null;
