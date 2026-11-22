import { cleanProgram } from "./policy-extras";
import { indicativeAmount, principalFor } from "./program-eligibility";

const fb = { rate: 9, tenureMonths: 180 };
const L = 100_000;
const Cr = 10_000_000;

// The worked examples in the Bandhan underwriting notes, used as proof the formulas are the ones described.
describe("indicative amounts from Bandhan's own program methods", () => {
  const income = cleanProgram({ name: "Income", maxAmount: 15 * Cr, minRate: 9, maxTenureMonths: 180, maxFoirPct: 80, maxLtvPct: 75, calc: { method: "income", rentalPct: 100, otherPct: 50 } })!;
  const margin = cleanProgram({ name: "Gross Margin", maxAmount: 5 * Cr, minRate: 9, maxTenureMonths: 180, maxFoirPct: 75, calc: { method: "turnover-margin", margins: { Service: 15, Manufacturing: 12, Trading: 12 } } })!;
  const purchase = cleanProgram({ name: "Commercial Purchase", maxAmount: 10 * Cr, calc: { method: "purchase", agreementPct: 90, marketPct: 70, stampDutyInBase: true } })!;
  const lowLtv = cleanProgram({ name: "Low LTV", maxAmount: 2 * Cr, minRate: 9, maxTenureMonths: 180, calc: { method: "abb-emi" } })!;

  it("income: ₹2 lakh income at 80% FOIR with ₹40,000 EMIs leaves ₹1.2 lakh a month to lend against", () => {
    const r = indicativeAmount({ monthlyIncome: 200_000, existingEmi: 40_000, propertyValue: 10 * Cr }, income, fb)!;
    const byIncome = r.parts.find((x) => x.label.startsWith("income"))!.amount;
    expect(byIncome).toBeCloseTo(principalFor(120_000, 9, 180), 0);
    expect(r.amount).toBeLessThanOrEqual(Math.min(...r.parts.map((x) => x.amount)));
  });
  it("counts rent in full and other income at half", () => {
    const base = indicativeAmount({ monthlyIncome: 100_000 }, income, fb)!;
    const more = indicativeAmount({ monthlyIncome: 100_000, rentalIncome: 50_000, otherIncome: 20_000 }, income, fb)!;
    expect(principalFor(((100_000 + 50_000 + 10_000) * 80) / 100, 9, 180)).toBeCloseTo(more.parts[0]!.amount, 0);
    expect(more.amount!).toBeGreaterThan(base.amount!);
  });
  it("is capped by the property (75% of value) and by the program maximum", () => {
    const r = indicativeAmount({ monthlyIncome: 5_000_000, propertyValue: 1 * Cr }, income, fb)!;
    expect(r.amount).toBe(0.75 * Cr);
    expect(indicativeAmount({ monthlyIncome: 50_000_000, propertyValue: 100 * Cr }, income, fb)!.amount).toBe(15 * Cr);
  });
  it("turnover × margin: ₹2 Cr trading turnover at 12% is ₹24 lakh a year, ₹2 lakh a month", () => {
    const r = indicativeAmount({ annualTurnover: 2 * Cr, industry: "trading" }, margin, fb)!;
    expect(r.note).toMatch(/₹2 L a month/);
    expect(r.parts[0]!.amount).toBeCloseTo(principalFor(200_000 * 0.75, 9, 180), 0);
  });
  it("commercial purchase: the lower of 90% of agreement plus stamp duty (₹95.4 L) and 70% of market value (₹63 L)", () => {
    const r = indicativeAmount({ agreementValue: 1 * Cr, stampDuty: 6 * L, propertyValue: 90 * L }, purchase, fb)!;
    expect(r.parts.map((x) => Math.round(x.amount))).toEqual(expect.arrayContaining([95_40_000, 63 * L]));
    expect(r.amount).toBe(63 * L);
  });
  it("low LTV: keeps the EMI below the average balance, within the ₹2 Cr maximum", () => {
    const r = indicativeAmount({ abb: 150_000 }, lowLtv, fb)!;
    expect(r.amount).toBeCloseTo(principalFor(150_000, 9, 180), 0);
    expect(r.amount!).toBeLessThanOrEqual(2 * Cr);
  });
  it("says what is missing instead of guessing", () => {
    expect(indicativeAmount({}, income, fb)!.amount).toBeNull();
    expect(indicativeAmount({}, income, fb)!.note).toMatch(/monthly income/);
    expect(indicativeAmount({ annualTurnover: 1 * Cr }, margin, fb)!.note).toMatch(/type of business/);
    expect(indicativeAmount({ annualTurnover: 1 * Cr, industry: "Mining" }, margin, fb)!.note).toMatch(/no margin recorded/);
  });
  it("gives no figure for a program whose method the bank has not confirmed", () => {
    const banking = cleanProgram({ name: "Banking", maxAmount: 5 * Cr })!;
    expect(indicativeAmount({ monthlyIncome: 300_000 }, banking, fb)).toBeNull();
  });
});
