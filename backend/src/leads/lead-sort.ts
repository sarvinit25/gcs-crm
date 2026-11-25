import type { Prisma } from "@prisma/client";

/**
 * The orders the lead list can be put in. "priority" is the long-standing default: Hot, Warm, Follow-up, Cold
 * (the segment enum's own order), then the soonest follow-up, then the newest enquiry.
 */
export const LEAD_SORTS = [
  "priority", "priority_cold", "number_new", "number_old", "followup", "followup_late", "amount", "amount_low",
  "name_az", "name_za", "product_az", "product_za", "source_az", "source_za", "reference_az", "reference_za",
  "owner_az", "owner_za", "chatbot_first", "chatbot_last", "contacts_most", "contacts_least", "status_flow", "status_flow_rev",
] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

/**
 * The database ordering for each choice. Every order ends with the lead number, which is unique, so two leads can
 * never swap places between pages and the list is stable as people page through it.
 */
export function leadOrderBy(sort: LeadSort | undefined): Prisma.LeadOrderByWithRelationInput[] {
  switch (sort) {
    case "priority_cold":
      return [{ segment: { sort: "desc", nulls: "last" } }, { nextFollowUpAt: { sort: "asc", nulls: "last" } }, { leadNo: "desc" }];
    case "number_new":
      return [{ leadNo: "desc" }];
    case "number_old":
      return [{ leadNo: "asc" }];
    case "followup":
      return [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { segment: { sort: "asc", nulls: "last" } }, { leadNo: "desc" }];
    case "amount":
      return [{ amount: { sort: "desc", nulls: "last" } }, { leadNo: "desc" }];
    case "amount_low":
      return [{ amount: { sort: "asc", nulls: "last" } }, { leadNo: "desc" }];
    case "followup_late":
      return [{ nextFollowUpAt: { sort: "desc", nulls: "last" } }, { leadNo: "desc" }];
    // Text columns, A to Z / Z to A. On a column that can be empty (reference, owner) the database puts the blanks last going
    // A to Z and first going Z to A: it cannot be told otherwise when sorting by a related record's name.
    case "name_az":
      return [{ name: "asc" }, { leadNo: "desc" }];
    case "name_za":
      return [{ name: "desc" }, { leadNo: "desc" }];
    case "product_az":
      return [{ loanProduct: { name: "asc" } }, { leadNo: "desc" }];
    case "product_za":
      return [{ loanProduct: { name: "desc" } }, { leadNo: "desc" }];
    case "source_az":
      return [{ source: "asc" }, { leadNo: "desc" }];
    case "source_za":
      return [{ source: "desc" }, { leadNo: "desc" }];
    case "reference_az":
      return [{ sourcingPartner: { name: "asc" } }, { leadNo: "desc" }];
    case "reference_za":
      return [{ sourcingPartner: { name: "desc" } }, { leadNo: "desc" }];
    case "owner_az":
      return [{ assignedOfficer: { name: "asc" } }, { leadNo: "desc" }];
    case "owner_za":
      return [{ assignedOfficer: { name: "desc" } }, { leadNo: "desc" }];
    case "chatbot_first":
      return [{ chatVerifiedAt: { sort: "desc", nulls: "last" } }, { leadNo: "desc" }];
    case "chatbot_last":
      return [{ chatVerifiedAt: { sort: "asc", nulls: "first" } }, { leadNo: "desc" }];
    case "contacts_most":
      return [{ followUps: { _count: "desc" } }, { leadNo: "desc" }];
    case "contacts_least":
      return [{ followUps: { _count: "asc" } }, { leadNo: "desc" }];
    // The statuses in the order a lead moves through them (New first, Lost last).
    case "status_flow":
      return [{ status: "asc" }, { leadNo: "desc" }];
    case "status_flow_rev":
      return [{ status: "desc" }, { leadNo: "desc" }];
    default:
      return [{ segment: { sort: "asc", nulls: "last" } }, { nextFollowUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { leadNo: "desc" }];
  }
}
