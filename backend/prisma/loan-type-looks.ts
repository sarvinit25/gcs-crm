// Starting picture, colour and collateral flag for the loan types that come with the CRM.
// Applied by the seed only to a loan type that has no code yet, so edits made on the Loan types page stay.
export const LOAN_TYPE_ICONS: Record<string, string> = {
  "home-loan": "home",
  "balance-transfer": "percent",
  "loan-against-property": "building",
  "lease-rental-discounting": "landmark",
  "dlod": "wallet",
  "project-funding": "construction",
  "business-loan": "briefcase",
  "unsecured-term-loan": "banknote",
  "cgtmse": "shield",
  "machine-loan": "factory",
  "working-capital-term-loan": "coins",
  "working-capital": "coins",
  "cash-credit": "wallet",
  "overdraft-limit": "wallet",
  "bank-guarantee": "shield",
  "letter-of-credit": "file",
  "bill-discounting": "receipt",
  "unsecured-dod": "wallet",
  "personal-loan": "user",
  "education-loan": "graduation",
  "new-car-loan": "car",
  "used-car-loan": "car",
  "car-refinance": "car",
  "commercial-vehicle": "truck",
  "loan-against-mutual-funds": "trending",
  "loan-against-securities": "trending",
  "professional-loan": "stethoscope",
  "private-funding": "gem",
  "micro-lap": "building",
  "micro-business-loan": "briefcase"
};

export const SECURED_LOAN_TYPES = new Set(["home-loan", "balance-transfer", "loan-against-property", "micro-lap", "lease-rental-discounting", "dlod", "project-funding", "machine-loan", "new-car-loan", "used-car-loan", "car-refinance", "commercial-vehicle", "loan-against-mutual-funds", "loan-against-securities"]);

export function loanTypeColor(category: string | null): string {
  if (category === "Property Finance") return "#845ADF";
  if (category === "Business Growth") return "#5C67F7";
  if (category === "Cash Flow & Trade") return "#17A2B8";
  if (category?.toLowerCase().startsWith("personal")) return "#26BF94";
  return "#6B7280";
}
