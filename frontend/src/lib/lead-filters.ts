import { LEAD_STATUSES } from "./types";

/**
 * The filters a link can open the Leads page with: from the Dashboard's charts and tiles, for example. Anything not
 * listed here (or with a value that does not make sense) is dropped, so a stale or hand-edited link can never break
 * the page.
 */
export type LeadLinkFilter = {
  status?: string;
  segment?: string;
  source?: string;
  /** true shows only leads whose follow-up is due. A real boolean, so the address reads dueOnly=true. */
  dueOnly?: boolean;
  /** A staff member's id, or "none" for leads nobody owns. */
  owner?: string;
};

const SEGMENTS = ["HOT", "WARM", "FOLLOW_UP", "COLD"];
const word = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : undefined);

export function parseLeadSearch(s: Record<string, unknown>): LeadLinkFilter {
  const out: LeadLinkFilter = {};
  if (typeof s.status === "string" && (LEAD_STATUSES as readonly string[]).includes(s.status)) out.status = s.status;
  if (typeof s.segment === "string" && SEGMENTS.includes(s.segment)) out.segment = s.segment;
  const source = word(s.source, 60);
  if (source) out.source = source;
  if (s.dueOnly === "true" || s.dueOnly === true) out.dueOnly = true;
  const owner = word(s.owner, 40);
  if (owner) out.owner = owner;
  return out;
}

/** A link to the Leads page with these filters. */
export const leadsLink = (filter: LeadLinkFilter = {}) => ({ to: "/leads" as const, search: filter });
