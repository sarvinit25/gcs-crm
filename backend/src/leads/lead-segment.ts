import { DocumentsStatus, LeadSegment, LeadStatus } from "@prisma/client";

/**
 * Which of the four working segments a lead belongs to, worked out from what is known about it.
 * They are listed in priority order, the order the Leads list sorts them in:
 *
 *  1. HOT        details and documents are complete: ready for a meeting, work it now.
 *  2. WARM       a real requirement and good potential, but something is still missing.
 *  3. FOLLOW_UP  interested, but will decide later: a follow-up date a few days or more away.
 *  4. COLD       too little to go on yet: needs a first conversation.
 *
 * A lead that is converted or lost is no longer worked, so it has no segment.
 * Kept free of the database so the rules can be read, tested and tuned in one place.
 */

/** A follow-up date further out than this means "deciding later" rather than "call again soon". */
export const PARK_DAYS = 2;

const CLOSED: LeadStatus[] = [LeadStatus.CONVERTED, LeadStatus.LOST];

export type SegmentInput = {
  status: LeadStatus;
  loanProductId: string | null;
  amount: unknown;
  city: string | null;
  employmentType: string | null;
  monthlyIncome: unknown;
  documentsStatus: DocumentsStatus;
  nextFollowUpAt: Date | null;
};

export type SegmentResult = {
  segment: LeadSegment | null;
  /** One line saying why, shown next to the segment. */
  note: string;
  /** What is still missing for the lead to be meeting-ready. */
  missing: string[];
};

const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "" && Number(v) !== 0;

/** What is still needed before a meeting: the details first, then the documents. */
export function missingForMeeting(lead: SegmentInput): string[] {
  const missing: string[] = [];
  if (!lead.loanProductId) missing.push("loan type");
  if (!has(lead.amount)) missing.push("loan amount");
  if (!lead.city?.trim()) missing.push("city");
  if (!lead.employmentType) missing.push("employment type");
  if (!has(lead.monthlyIncome)) missing.push("monthly income");
  if (lead.documentsStatus === DocumentsStatus.NONE) missing.push("documents");
  else if (lead.documentsStatus === DocumentsStatus.PARTIAL) missing.push("remaining documents");
  return missing;
}

const day = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function classifyLead(lead: SegmentInput, now: Date = new Date()): SegmentResult {
  const missing = missingForMeeting(lead);

  if (CLOSED.includes(lead.status)) {
    return { segment: null, note: "Closed", missing };
  }

  // Parked: the customer said they would decide later, so it waits until the date they gave.
  if (lead.nextFollowUpAt && lead.nextFollowUpAt.getTime() > now.getTime() + PARK_DAYS * 86_400_000) {
    return { segment: LeadSegment.FOLLOW_UP, note: `Deciding later. Follow up on ${day(lead.nextFollowUpAt)}.`, missing };
  }

  if (missing.length === 0) {
    return { segment: LeadSegment.HOT, note: "Details and documents complete. Ready for a meeting.", missing };
  }

  // A requirement is on the table (loan type or amount), or the team has already qualified it.
  const requirement = Boolean(lead.loanProductId) || has(lead.amount);
  const worked: LeadStatus[] = [LeadStatus.QUALIFIED, LeadStatus.DOCS_PENDING];
  if (requirement || worked.includes(lead.status)) {
    return { segment: LeadSegment.WARM, note: `Good potential. Still needed: ${missing.join(", ")}.`, missing };
  }

  return {
    segment: LeadSegment.COLD,
    note: "Nothing to go on yet. Needs a first conversation to learn the requirement.",
    missing,
  };
}
