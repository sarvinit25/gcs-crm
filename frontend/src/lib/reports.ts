/** Shapes the Reports hub and detailed-report endpoints return. */

export type MonthPoint = { month: string; label: string; count: number; amount: number };
export type StageRow = { key: string; label: string; count: number; amount: number };
export type Tile = { label: string; value: number; kind: "count" | "amount" };
export type LoanTypeRow = { name: string; count: number; amount: number; percent: number };

export type ReportCard = { kind: string; title: string; blurb: string };

export type Hub = {
  range: { from: string | null; to: string | null; label: string };
  kpis: {
    leads: { total: number; thisMonth: number };
    activeFiles: { total: number; loggedIn: number };
    sanctioned: { count: number; amount: number; thisMonth: number };
    disbursed: { count: number; amount: number; thisMonth: number; thisMonthAmount: number };
    commission: { total: number; pending: number; thisMonth: number } | null;
  };
  trends: { month: string; label: string; leads: number; files: number; sanctions: number; disbursals: number }[];
  pipeline: { total: number; stages: { key: string; label: string; count: number }[] };
  lenders: { lender: string; sanctions: number; sanctionedAmount: number; disbursedAmount: number }[];
  commission: { due: number; claimed: number; received: number; total: number } | null;
  reports: ReportCard[];
};

export type Detail = {
  kind: string;
  title: string;
  blurb: string;
  stageTitle: string;
  amountLabel: string;
  rangeLabel: string;
  tiles: Tile[];
  total: { count: number; amount: number };
  stages: StageRow[];
  trend: MonthPoint[];
  loanTypes: LoanTypeRow[];
};

export type ReportTemplate = { id: string; type: string; name: string; columns: string[]; updatedAt: string };

/** What the filter bar can narrow a detailed report by. Empty strings mean "any". */
export type DetailFilters = { from: string; to: string; lenderId: string; channel: string; partnerId: string };
export const NO_FILTERS: DetailFilters = { from: "", to: "", lenderId: "", channel: "", partnerId: "" };

export const filtersActive = (f: DetailFilters) => Object.values(f).some(Boolean);

/** Each report on the hub, its icon name and the register its Export button draws from. */
export const EXPORT_TYPE: Record<string, string> = {
  leads: "leads",
  callbacks: "leads",
  files: "applications",
  "login-files": "applications",
  sanctions: "sanctions",
  disbursals: "disbursements",
  rejects: "applications",
  commissions: "commissions",
};

/** Filters a report's own Export adds so the file matches the report ("rejects" exports rejected files). */
export const EXPORT_EXTRA: Record<string, Record<string, string>> = {
  callbacks: { hasFollowUp: "true" },
  "login-files": { loggedIn: "true", dateBy: "login" },
  rejects: { status: "REJECTED", dateBy: "updated" },
};
