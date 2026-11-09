export type LenderContact = {
  id: string;
  lenderId: string;
  name: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
  segments: string[];
  notes: string | null;
  active: boolean;
  kind: "RELATIONSHIP" | "DIRECTORY";
  altPhone: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  branch: string | null;
  coverage: string | null;
  employeeCode: string | null;
  escalation: { role: string | null; name: string; phone: string | null; email: string | null }[] | null;
  details: Record<string, string> | null;
  source: string | null;
  lender: { id: string; name: string; type: "BANK" | "NBFC" };
};

export type Paged<T> = { items: T[]; total: number; page: number; limit: number };

/** Where a person sits, as one line: "Branch · City, State". */
export function whereLine(c: Pick<LenderContact, "city" | "state" | "branch" | "region">) {
  const place = [c.city, c.state].filter(Boolean).join(", ");
  return [c.branch && c.branch !== c.city ? c.branch : null, place || c.region].filter(Boolean).join(" · ");
}

/**
 * Which loan types a product belongs to, judged from its name — so the person who handles
 * "Business Loan" files comes first when you are logging in a business loan. The segment
 * names are the ones configured in Settings; anything unrecognised matches nothing.
 */
const RULES: { test: RegExp; segments: string[] }[] = [
  { test: /machinery|equipment|capex/i, segments: ["Machinery Loan"] },
  { test: /overdraft|\bod\b|cash credit|working capital/i, segments: ["Overdraft", "Working Capital"] },
  { test: /education/i, segments: ["Education Loan"] },
  { test: /car|vehicle/i, segments: ["Car Loan", "New Car Loan", "Used Car Loan", "Commercial Vehicle Loan"] },
  { test: /business|msme|sme|trade|merchant/i, segments: ["Business Loan", "Small Business Loan"] },
  { test: /home|housing|property|lap|mortgage|plot|construction|balance transfer|top.?up|lease rental|secured/i, segments: ["Secured Loan"] },
  { test: /\bhome loan\b/i, segments: ["Home Loan"] },
  { test: /loan against property|\blap\b/i, segments: ["Loan Against Property"] },
  { test: /personal/i, segments: ["Personal Loan"] },
];

export function segmentsForProduct(productName: string | null | undefined): string[] {
  if (!productName) return [];
  const out = new Set<string>();
  for (const r of RULES) if (r.test.test(productName)) r.segments.forEach((s) => out.add(s));
  return [...out];
}

/** People who handle this product's loan type first, then everyone else — each group alphabetical. */
export function rankContacts<T extends Pick<LenderContact, "name" | "segments">>(contacts: T[], productName: string | null | undefined): { contact: T; relevant: boolean }[] {
  const wanted = new Set(segmentsForProduct(productName));
  return contacts
    .map((contact) => ({ contact, relevant: contact.segments.some((s) => wanted.has(s)) }))
    .sort((a, b) => Number(b.relevant) - Number(a.relevant) || a.contact.name.localeCompare(b.contact.name));
}
