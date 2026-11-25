// Files a document under the category the checklist uses, from what its name and caption say. Staff and customers name files
// the way they think of them ("PAN Card - Davinder.pdf", "IDFC 3038 - Jul 25 To Jun 26.pdf"), so the category is a careful guess:
// anything not clearly one of them stays "Other" and a person can move it.
//
// The order matters: a loan statement of account ("SOA IDFC LAP") is a Sanction letter, not a Bank statement, even though it
// names a bank, so the more specific groups are tried first.

export const DOCUMENT_CATEGORIES = ["KYC", "Income proof", "Bank statement", "Business proof", "Asset proof", "Property papers", "Sanction letter", "Other"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

const BANKS =
  "federal|icici|idfc|axis|hdfc|sbi|kotak|yes bank|indusind|bandhan|canara|pnb|union|bank of baroda|bob|rbl|saraswat|cosmos|sbm|dbs|au bank|au small|hsbc|citi|standard chartered|idbi|abhyudaya|tmb|tamilnad|apna|equitas|ujjivan";

/** "Union 4129 - ... - 01 Jun 26 To 31 Aug 26": a name, the account's last digits and a period is a statement. */
const PERIOD = "\\b[a-z]+ \\d{4}\\b.*\\b\\d{2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \\d{2} to\\b";

const RULES: [DocumentCategory, RegExp][] = [
  ["Business proof", /partne\w* deed|llp deed|\bmoa\b|\baoa\b/],
  // "SL" is how staff write sanction letter; disbursement advices and cheques sit with it.
  ["Sanction letter", /sanction(?!ed plan)|\bsl\b|disburs|\bsoa\b|statement of account|foreclos|\blod\b|loan agreement|repayment schedule|emi (details|schedule)/],
  [
    "Property papers",
    /agreement|\bindex\b|index-?\s?ii|sale deed|gift deed|conveyance|\bdeed\b|\bag-?\d+\b|\bnoc\b|share certificate|occupancy|\boc\b|\bcc\b|commencement|search (clearance|report)|title|chain|property|drawing|sanctioned plan|society|maintenance|tax receipt|7\/12|khata|mutation|affidavit|demand letter|cost ?sheet|payment receipt|\bocr\b|payment schedule|\bapf\b|\brera\b|brochure|allotment/,
  ],
  ["KYC", /driving licen/],
  [
    "Business proof",
    /\bgst|gstr|udyam|udyog|msme|shop act|partne|\bmoa\b|\baoa\b|llp|incorporation|certificate of (registration|incorporation)|licen[cs]e|debtor|creditor|business proof|gumasta|fssai|professional (degree|certificate)/,
  ],
  ["Income proof", /\bitr\b|income tax|computation|\bcoi\b|p&l|\bpl\b|profit|balance sheet|\bbs\b|form ?16|26as|salary ?slip|salary certificate|pay ?slip|appointment letter|employment|audit|udin|ca attested|ack(nowledg)?/],
  ["Bank statement", new RegExp(`bank statement|statement|passbook|\\b(${BANKS})\\b.*\\b(\\d{3,}|sb|ca|savings|current)\\b|\\b(sb|ca)\\s?\\d{3,}|${PERIOD}`)],
  ["KYC", /\bpan\b|aadh?a+r|passport|voter|\bphoto\b|photograph|ration card|electricity|elec bill|\be ?bill\b|light bill|utility|address proof|kyc|\bid proof\b/],
  ["Asset proof", /quotation|down payment|\brc\b|registration certificate|invoice|vehicle|machinery/],
];

export function classifyDocument(fileName: string, caption?: string | null): DocumentCategory {
  const text = `${fileName} ${caption ?? ""}`.toLowerCase().replace(/[_]+/g, " ");
  for (const [category, re] of RULES) if (re.test(text)) return category;
  return "Other";
}
