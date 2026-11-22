/** The orders the Leads list can be put in. The server does the sorting, so the order holds across pages. */
export const LEAD_SORTS = [
  { value: "priority", label: "Priority: Hot to Cold" },
  { value: "priority_cold", label: "Priority: Cold to Hot" },
  { value: "number_new", label: "Lead number: newest first" },
  { value: "number_old", label: "Lead number: oldest first" },
  { value: "name_az", label: "Name: A to Z" },
  { value: "name_za", label: "Name: Z to A" },
  { value: "product_az", label: "Product: A to Z" },
  { value: "product_za", label: "Product: Z to A" },
  { value: "amount", label: "Amount: highest first" },
  { value: "amount_low", label: "Amount: lowest first" },
  { value: "source_az", label: "Source: A to Z" },
  { value: "source_za", label: "Source: Z to A" },
  { value: "reference_az", label: "Reference: A to Z" },
  { value: "reference_za", label: "Reference: Z to A" },
  { value: "chatbot_first", label: "Chatbot: verified first" },
  { value: "chatbot_last", label: "Chatbot: not verified first" },
  { value: "owner_az", label: "Owner: A to Z" },
  { value: "owner_za", label: "Owner: Z to A" },
  { value: "contacts_most", label: "Times contacted: most first" },
  { value: "contacts_least", label: "Times contacted: fewest first" },
  { value: "followup", label: "Follow-up: soonest first" },
  { value: "followup_late", label: "Follow-up: latest first" },
  { value: "status_flow", label: "Status: New to Lost" },
  { value: "status_flow_rev", label: "Status: Lost to New" },
] as const;

/** The two orders behind each sortable column heading: clicking the heading goes to the first, again to the second, again back to the default. */
export const COLUMN_SORTS: Record<string, [LeadSortValue, LeadSortValue]> = {
  lead: ["name_az", "name_za"],
  priority: ["priority", "priority_cold"],
  product: ["product_az", "product_za"],
  amount: ["amount", "amount_low"],
  source: ["source_az", "source_za"],
  reference: ["reference_az", "reference_za"],
  chatbot: ["chatbot_first", "chatbot_last"],
  owner: ["owner_az", "owner_za"],
  contacts: ["contacts_most", "contacts_least"],
  followup: ["followup", "followup_late"],
  status: ["status_flow", "status_flow_rev"],
};

/** What clicking a column heading does next: first order, second order, then back to the default list order. */
export function nextColumnSort(column: string, current: LeadSortValue): LeadSortValue {
  const pair = COLUMN_SORTS[column];
  if (!pair) return current;
  if (current === pair[0]) return pair[1];
  if (current === pair[1]) return DEFAULT_LEAD_SORT;
  return pair[0];
}

/** Which way a column is sorted now: for the arrow in its heading. */
export function columnDirection(column: string, current: LeadSortValue): "first" | "second" | null {
  const pair = COLUMN_SORTS[column];
  if (!pair) return null;
  return current === pair[0] ? "first" : current === pair[1] ? "second" : null;
}

export type LeadSortValue = (typeof LEAD_SORTS)[number]["value"];
export const DEFAULT_LEAD_SORT: LeadSortValue = "priority";

/** The value to send to the server: nothing for the default, so the address stays as it always was. */
export const sortParam = (sort: LeadSortValue): LeadSortValue | undefined => (sort === DEFAULT_LEAD_SORT ? undefined : sort);
