/**
 * Score bands the way lenders read a CIBIL score (300–900). A band is a convenience for scanning a
 * list; the number itself is always shown alongside it.
 */
export const BANDS = [
  { key: "excellent", label: "Excellent (750+)", min: 750, max: 900 },
  { key: "good", label: "Good (700–749)", min: 700, max: 749 },
  { key: "fair", label: "Fair (650–699)", min: 650, max: 699 },
  { key: "low", label: "Low (below 650)", min: 300, max: 649 },
] as const;

export type BandKey = (typeof BANDS)[number]["key"];

export const MIN_SCORE = 300;
export const MAX_SCORE = 900;

export function bandOf(score: number | null | undefined): BandKey | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  if (score < MIN_SCORE || score > MAX_SCORE) return null;
  return BANDS.find((b) => score >= b.min && score <= b.max)?.key ?? null;
}

export const rangeOfBand = (key: string) => BANDS.find((b) => b.key === key);

/** How the person agreed to the check. Recorded with every pull. */
export const CONSENT_METHODS = [
  "Signed consent form",
  "Customer agreed in writing (WhatsApp / email)",
  "Customer agreed on a recorded call",
  "Customer ticked consent on our online form",
] as const;

// Same wording as the website (src/data/consent.ts there): shown in full, never shortened.
export const DEFAULT_CONSENT_TEXT =
  "I voluntarily agree and undertake that I have read and understood the Terms & Conditions and Privacy Policy of Growth Capital Services, along with the terms and privacy policies of the participating banks, NBFCs and other lenders, which are available on their own websites. I authorise Growth Capital Services to collect and process my personal information to evaluate my preliminary loan eligibility, including obtaining my credit information, report and score from credit information companies (such as CIBIL, Experian, Equifax and CRIF High Mark) and carrying out PAN and name verification where applicable. I further authorise Growth Capital Services to share my information with the participating banks, NBFCs and lenders so that they can assess my eligibility for their loan products. I understand that Growth Capital Services is a loan advisory and facilitation firm and not a lender, that my enquiry is not a loan approval, and that if I choose to proceed with a lender, the loan application, KYC, underwriting, signing of loan documents, disbursement and servicing will be carried out by that lender under its own terms and privacy policy. I also consent to and authorise those lenders to check and process my credit information from credit bureaus, validate my PAN with NSDL, fetch the information needed for KYC from approved agencies including UIDAI, validate my bank account details, and share my data with third-party vendors for verification. I further confirm that my gross household income is more than Rs. 25,000 per month, and I consent to Growth Capital Services and/or its partner lenders contacting me with personalised offers and updates on loans, products and services through SMS, WhatsApp, RCS, email, telephone and bot calls, chat and voice bots, in-app notifications or any other secure mode of communication, and I agree that this consent overrides any registration I may have for DND and/or NDNC. This consent stays valid for 365 days from the date I give it, unless I withdraw it earlier in accordance with applicable law. I voluntarily provide my personal details and authorise Growth Capital Services to obtain my credit profile and score from the credit information companies for a period of 6 months from the date of this consent, and that authorisation stays valid for those 6 months unless I withdraw it earlier in accordance with applicable law. I may withdraw my consent, or ask for my data to be deleted, at any time by writing to connect.gcs@growthcapitalservices.in.";
