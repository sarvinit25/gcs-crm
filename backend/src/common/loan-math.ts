/**
 * Loan figures shared by sanctions and disbursements. Kept free of Nest and
 * Prisma so the same arithmetic can be checked in plain unit tests.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Equated monthly instalment for a reducing-balance loan.
 * Returns null when any input is missing or not a usable number, so callers
 * can leave the field blank instead of storing a nonsense figure.
 */
export function emi(
  principal: number | null | undefined,
  annualRatePercent: number | null | undefined,
  months: number | null | undefined,
): number | null {
  if (principal == null || annualRatePercent == null || months == null) return null;
  if (!(principal > 0) || !(months > 0) || annualRatePercent < 0) return null;
  const monthly = annualRatePercent / 12 / 100;
  if (monthly === 0) return round2(principal / months);
  const growth = Math.pow(1 + monthly, months);
  return round2((principal * monthly * growth) / (growth - 1));
}

/** A fee quoted either as a percentage of a base amount or as a flat sum. */
export function feeAmount(
  base: number | null | undefined,
  percent: number | null | undefined,
  flat: number | null | undefined,
): number | null {
  if (flat != null) return round2(flat);
  if (percent != null && base != null) return round2((base * percent) / 100);
  return null;
}

/** What reaches the borrower once every deduction is taken off the amount released. */
export function netOfDeductions(amount: number, deductions: Array<number | null | undefined>): number {
  const total = deductions.reduce<number>((sum, d) => sum + (d ?? 0), 0);
  return round2(amount - total);
}

/** Percentage that `part` is of `whole`, to two places. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? round2((part / whole) * 100) : 0;
}

export { round2 };
