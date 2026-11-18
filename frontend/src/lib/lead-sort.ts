/** The orders the Leads list can be put in. The server does the sorting, so the order holds across pages. */
export const LEAD_SORTS = [
  { value: "priority", label: "Priority: Hot to Cold" },
  { value: "priority_cold", label: "Priority: Cold to Hot" },
  { value: "number_new", label: "Lead number: newest first" },
  { value: "number_old", label: "Lead number: oldest first" },
  { value: "followup", label: "Follow-up: soonest first" },
  { value: "amount", label: "Amount: highest first" },
] as const;

export type LeadSortValue = (typeof LEAD_SORTS)[number]["value"];
export const DEFAULT_LEAD_SORT: LeadSortValue = "priority";

/** The value to send to the server: nothing for the default, so the address stays as it always was. */
export const sortParam = (sort: LeadSortValue): LeadSortValue | undefined => (sort === DEFAULT_LEAD_SORT ? undefined : sort);
