/** The arithmetic of a credit evaluation, kept apart so each formula can be checked on its own. */

/** Monthly instalment on `amount` at `annualRate` % a year over `months`. Null until all three are known. */
export function emi(amount: number, annualRate: number, months: number): number | null {
  if (!(amount > 0) || !(annualRate > 0) || !(months > 0)) return null;
  const r = annualRate / 12 / 100;
  const f = Math.pow(1 + r, months);
  return (amount * r * f) / (f - 1);
}

/** The loan a given monthly instalment can carry: the reverse of emi(). */
export function loanForEmi(monthlyEmi: number, annualRate: number, months: number): number | null {
  if (!(monthlyEmi > 0) || !(annualRate > 0) || !(months > 0)) return null;
  const r = annualRate / 12 / 100;
  const f = Math.pow(1 + r, months);
  return (monthlyEmi * (f - 1)) / (r * f);
}

/** Fixed obligations to income, as a percentage. Null when income is not known. */
export function foir(existingEmi: number, proposedEmi: number | null, monthlyIncome: number): number | null {
  if (!(monthlyIncome > 0) || proposedEmi === null) return null;
  return ((existingEmi + proposedEmi) / monthlyIncome) * 100;
}

/** What is left of income for a new EMI once the ceiling and the existing EMIs are taken. */
export function roomForEmi(monthlyIncome: number, maxFoirPercent: number, existingEmi: number): number {
  return Math.max(0, (monthlyIncome * maxFoirPercent) / 100 - existingEmi);
}

/** Debt service coverage: yearly earnings before debt cost, over yearly instalments. Null without any debt service to cover. */
export function dscr(netProfit: number, depreciation: number, interestPaid: number, annualDebtService: number): number | null {
  if (!(annualDebtService > 0)) return null;
  return (netProfit + depreciation + interestPaid) / annualDebtService;
}

/** How far `actual` sits from `declared`, as a percentage of declared (negative = lower than declared). */
export function variancePercent(actual: number, declared: number): number | null {
  if (!(declared > 0)) return null;
  return ((actual - declared) / declared) * 100;
}

/** Loan as a share of the property value. */
export function ltv(loan: number, propertyValue: number): number | null {
  if (!(propertyValue > 0) || !(loan > 0)) return null;
  return (loan / propertyValue) * 100;
}
