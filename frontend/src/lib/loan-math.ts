/**
 * Mirrors the server's EMI maths so a form can show the figure as it is typed.
 * The server recomputes on save; this is only a preview.
 */
export function emi(
  principal: number | null | undefined,
  annualRatePercent: number | null | undefined,
  months: number | null | undefined,
): number | null {
  if (principal == null || annualRatePercent == null || months == null) return null;
  if (!(principal > 0) || !(months > 0) || annualRatePercent < 0) return null;
  const monthly = annualRatePercent / 12 / 100;
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  if (monthly === 0) return round2(principal / months);
  const growth = Math.pow(1 + monthly, months);
  return round2((principal * monthly * growth) / (growth - 1));
}

/** What reaches the borrower once the deductions come off. Blank fields count as nothing. */
export function netOfDeductions(amount: number, deductions: Array<number | null | undefined>): number {
  const total = deductions.reduce<number>((sum, d) => sum + (Number.isFinite(d) ? (d as number) : 0), 0);
  return Math.round((amount - total + Number.EPSILON) * 100) / 100;
}

/** Percentage of a base, or null when either side is not a usable number. */
export function percentAmount(base: number, percent: number): number | null {
  if (!Number.isFinite(base) || !Number.isFinite(percent)) return null;
  return Math.round(((base * percent) / 100 + Number.EPSILON) * 100) / 100;
}
