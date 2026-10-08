export type BandKey = "excellent" | "good" | "fair" | "low";
export type CheckKind = "LIVE" | "MANUAL" | "SIMULATED";

export type CreditStatus = {
  mode: "none" | "sandbox";
  live: boolean;
  simulated: boolean;
  available: boolean;
  consentText: string;
  consentMethods: string[];
  recheckDays: number;
  bands: { key: BandKey; label: string; min: number; max: number }[];
};

export type CreditRow = {
  id: string;
  name: string;
  isPrimary: boolean;
  phone: string | null;
  hasPan: boolean;
  hasDob: boolean;
  score: number | null;
  band: BandKey | null;
  scoreDate: string | null;
  stale: boolean;
  source: CheckKind | null;
  reference: string | null;
  application: { id: string; applicationNo: string; status: string; product: string; owner: string | null };
};

export type CreditList = {
  items: CreditRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { applicants: number; scored: number; withoutScore: number; averageScore: number | null; low: number; checksThisMonth: number };
};

export type CheckRecord = {
  id: string;
  kind: CheckKind;
  status: "SUCCESS" | "FAILED";
  score: number | null;
  band: BandKey | null;
  reportDate: string | null;
  reference: string | null;
  note: string | null;
  consentMethod: string | null;
  consentAt: string | null;
  createdAt: string;
  requestedBy: { name: string } | null;
  applied?: boolean;
};

export type CheckHistory = { applicant: { id: string; name: string; score: number | null; band: BandKey | null; scoreDate: string | null }; checks: CheckRecord[] };

/** Colours for each band — a quick scan aid, always shown next to the number itself. */
export const BAND_STYLE: Record<BandKey, { chip: string; text: string; label: string }> = {
  excellent: { chip: "bg-emerald-50 text-emerald-700", text: "text-emerald-700", label: "Excellent" },
  good: { chip: "bg-sky-50 text-sky-700", text: "text-sky-700", label: "Good" },
  fair: { chip: "bg-amber-50 text-amber-700", text: "text-amber-700", label: "Fair" },
  low: { chip: "bg-red-50 text-red-700", text: "text-red-700", label: "Low" },
};

export const KIND_LABEL: Record<CheckKind, string> = {
  LIVE: "Bureau check",
  MANUAL: "Report on file",
  SIMULATED: "Simulated",
};

/** What has to be on the applicant before the bureau can be asked, in plain words. */
export function missingForCheck(r: Pick<CreditRow, "hasPan" | "hasDob" | "phone">): string[] {
  return [!r.hasPan && "PAN", !r.hasDob && "date of birth", !r.phone && "mobile number"].filter(Boolean) as string[];
}
