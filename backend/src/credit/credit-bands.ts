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

export const DEFAULT_CONSENT_TEXT =
  "I authorise Growth Capital Services and the lenders it submits my application to obtain my credit information report and score from the credit information company (CIBIL) for the purpose of processing my loan application. I understand this is a soft enquiry.";
