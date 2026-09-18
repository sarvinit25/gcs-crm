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
