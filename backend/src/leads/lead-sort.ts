import type { Prisma } from "@prisma/client";

/**
 * The orders the lead list can be put in. "priority" is the long-standing default: Hot, Warm, Follow-up, Cold
 * (the segment enum's own order), then the soonest follow-up, then the newest enquiry.
 */
export const LEAD_SORTS = ["priority", "priority_cold", "number_new", "number_old", "followup", "amount"] as const;
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
    default:
      return [{ segment: { sort: "asc", nulls: "last" } }, { nextFollowUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { leadNo: "desc" }];
  }
}
