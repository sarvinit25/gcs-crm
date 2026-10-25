export type LenderRow = {
  id: string;
  name: string;
  shortName: string | null;
  type: "BANK" | "NBFC";
  logoUrl: string | null;
  isPublic: boolean;
  active: boolean;
  sortOrder: number;
  brokerCode: string | null;
  defaultCommission: string | null;
  applicationCount: number;
  contactCount: number;
  policyCount: number;
  activePolicyCount: number;
  relationshipManager: { name: string; phone: string | null; email: string | null } | null;
};

export const percent = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : `${Number(v)}%`;
