import type { Lead } from "./types";

/** An archived lead as the Archived leads section receives it: the usual lead, plus what archiving adds. */
export type ArchivedLead = Lead & {
  daysInPipeline: number | null;
  archivedByName: string | null;
  application: { id: string; applicationNo: string } | null;
};

export type ArchivedSummary = {
  total: number;
  converted: number;
  lost: number;
  convertedAmount: number;
  lostAmount: number;
  averageDays: number;
  lostReasons: { reason: string; count: number }[];
};

export type ArchivedResult = { summary: ArchivedSummary; items: ArchivedLead[]; total: number; page: number; pageSize: number };

/** "Same day", "1 day", "12 days": how long a lead took from coming in to being archived. */
export function daysLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return "—";
  if (days === 0) return "Same day";
  return days === 1 ? "1 day" : `${days} days`;
}

/** Share of archived leads that were converted, as a whole percent (0 when nothing is archived). */
export const convertedShare = (s: Pick<ArchivedSummary, "total" | "converted">) => (s.total ? Math.round((s.converted / s.total) * 100) : 0);
