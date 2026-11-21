// CA & Legal enquiries on WhatsApp. The assistant was built around loans, so someone asking about GST or a rent agreement
// kept being asked which loan they wanted. This recognises those enquiries, answers in plain words WITHOUT inventing a price,
// takes down what the person needs, and hands the chat to the team. It is all decided here in code, so what is said and
// saved is predictable. The services themselves are delivered by our associated CA and legal professionals; GCS is the
// single point of contact (the same line the website's assistant uses).

export const CA_LEGAL_PAGE = "https://growthcapitalservices.in/ca-legal-services";

export type Category =
  | "Tax & Income Tax"
  | "GST & Compliance"
  | "Accounting & Audit"
  | "Business Registration"
  | "Legal Drafting"
  | "Property Legal Services"
  | "Housing Society Services"
  | "SRA / MHADA / MMRDA"
  | "Redevelopment"
  | "NRI & Family Property Services"
  | "CA & Legal";

/** `strong` words only ever mean a CA or legal service. The others (audit, agreement) also appear in loan talk. */
const RULES: { category: Category; strong: boolean; test: RegExp }[] = [
  { category: "Tax & Income Tax", strong: true, test: /\b(itr|income tax|tax (return|returns|filing|planning)|form ?16|capital gains?|26as|advance tax)\b/i },
  { category: "Tax & Income Tax", strong: false, test: /\btds\b/i },
  { category: "GST & Compliance", strong: true, test: /\b(gst|gstin|gstr|gst ?(return|registration|notice)|e-?way ?bill)\b/i },
  { category: "Accounting & Audit", strong: true, test: /\b(bookkeeping|book keeping|accounting|accountant|tax audit|statutory audit|gst audit|tally)\b/i },
  { category: "Accounting & Audit", strong: false, test: /\baudit\b/i },
  { category: "Business Registration", strong: true, test: /\b(company|llp|firm|trust|ngo) (registration|incorporation|formation)\b|\b(register|incorporate) (a |my |our )?(new )?(company|llp|firm|business|trust)\b|\b(msme|udyam|shop ?act|gumasta|fssai|trademark|import export code|partnership deed)\b/i },
  { category: "Legal Drafting", strong: true, test: /\b(affidavit|legal notice|rent agreement|leave and licen[cs]e|power of attorney|gift deed|nda|mou|legal drafting|draft(ing)? (an? |the )?(agreement|contract|notice))\b/i },
  { category: "Legal Drafting", strong: false, test: /\b(agreement|contract|notice)\b/i },
  { category: "Property Legal Services", strong: true, test: /\b(title (check|search|verification|report|clearance|certificate)|legal opinion|property (legal|verification|dispute)|sale deed|conveyance|encumbrance|mutation|7\/12)\b/i },
  { category: "Housing Society Services", strong: true, test: /\b(society (noc|transfer|share)|share certificate|housing society|society (documents?|papers?))\b/i },
  { category: "SRA / MHADA / MMRDA", strong: true, test: /\b(sra|mhada|mmrda|slum rehabilitation)\b/i },
  { category: "Redevelopment", strong: true, test: /\bre-?development\b/i },
  { category: "NRI & Family Property Services", strong: true, test: /\b(nri property|(make|draft|write|prepare|register) (a |my )?will|probate|legal heir|succession (certificate|planning)|inheritance|family settlement)\b/i },
  { category: "CA & Legal", strong: true, test: /\b(chartered accountant|lawyer|advocate|ca (service|services|help)|legal (service|services|help|advice|work|matter)|ca (and|&) legal)\b/i },
];

const LOAN_WORDS = /\b(loan|emi|interest|mortgage|cibil|sanction|disburs\w*|processing fee|foreclos\w*|balance transfer|overdraft|cgtmse|lap)\b/i;

/** The CA or legal services a message is asking about, or null when it is not about them (or is really about a loan). */
export function caLegalIntent(text: string): { categories: Category[] } | null {
  const hits = RULES.filter((r) => r.test.test(text));
  if (!hits.length) return null;
  const anyStrong = hits.some((h) => h.strong);
  // "agreement", "notice" or "audit" inside loan talk is the loan flow's business, not ours.
  if (!anyStrong && LOAN_WORDS.test(text)) return null;
  // A message that is clearly about a loan, with only a passing mention (GST returns as a loan document), is the loan flow's too.
  const specific = hits.filter((h) => h.category !== "CA & Legal");
  const categories = [...new Set((specific.length ? specific : hits).map((h) => h.category))];
  if (LOAN_WORDS.test(text) && !/\b(ca (and|&) legal|legal service|ca service|lawyer|advocate|chartered accountant)\b/i.test(text) && /\b(documents?|required|needed|need for|for (a |my )?loan|eligib\w*|statements?)\b/i.test(text)) return null;
  return { categories: categories as Category[] };
}

/**
 * Does the message clearly ask for a CA or legal service ("I need GST registration", "can you file my ITR")? While a customer is
 * answering a loan form, only such a request leaves the form: "Yes, GST registered" is an answer to the form's own question.
 */
export const asksForService = (text: string) =>
  /\b(i|we) (need|want|require)\b|\blooking for\b|\bhelp (me )?(with|in)\b|\bcan (you|u)\b|\bcould you\b|\bdo (you|u) (do|provide|offer|handle|help)\b|\bplease (do|file|register|draft|arrange)\b|\b(register|file|draft|prepare) (my|our|a|an)\b|\bneed (a|an|to|help)\b/i.test(text);

/** A person asking for a loan while we wait for their CA/legal details: the loan flow should carry on. */
export const looksLikeLoanTalk = (text: string) => LOAN_WORDS.test(text) && !caLegalIntent(text);

const list = (c: Category[]) => (c.length <= 1 ? (c[0] ?? "CA and legal services") : `${c.slice(0, -1).join(", ")} and ${c[c.length - 1]}`);

/** Long enough to say what they need, so there is no point asking again. */
export const hasEnoughDetail = (text: string) => text.trim().length >= 45;

export function askReply(categories: Category[]): string {
  return [
    `Yes, we can help with ${list(categories)}. These services are handled by our associated CA and legal professionals, and Growth Capital Services stays your single point of contact. The charges depend on the work, and we always share them in writing before you go ahead.`,
    "",
    'To get this to the right person, please tell me in a line or two what you need (for example "GST registration for a small shop in Thane"), and your city.',
    "",
    `You can see what we cover here: ${CA_LEGAL_PAGE}`,
  ].join("\n");
}

export function handoffReply(categories: Category[] | null): string {
  return [
    `Thank you. I have passed this to our CA and legal team${categories?.length ? ` (${list(categories)})` : ""}. Someone will message or call you here shortly. The charges depend on the work and we confirm them in writing before you go ahead.`,
    "",
    "If you have documents, photos or a video that help, you can send them in this chat and they will be kept on your file.",
  ].join("\n");
}
