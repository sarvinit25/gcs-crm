import { agesFrom, creditScoreFrom, foirFrom, ltvFrom, rulesFromFlyers, tenureMonthsFrom, type CurrentRules } from "./flyer-fill";

const none: CurrentRules = { minAmount: null, maxAmount: null, minRate: null, maxRate: null, maxTenureMonths: null, minCreditScore: null, minAge: null, maxAgeAtMaturity: null, foirBands: null, ltvBands: null };

describe("reading figures out of flyer text", () => {
  it("takes the most lenient loan-to-value and ignores shares of other things", () => {
    expect(ltvFrom("LTV 75% to 65% depending on property segment")).toBe(75);
    expect(ltvFrom("LTV Up to 90% for loans up to ₹30 Lakhs; Up to 80% above")).toBe(90);
    expect(ltvFrom("LTV up to 50% of Turnover")).toBeNull();
    expect(ltvFrom("LTV up to 80% of Net Rental Income")).toBeNull();
    expect(ltvFrom("funding 65% of market value")).toBe(65);
    expect(ltvFrom("no figure here")).toBeNull();
  });
  it("reads the income share, leaving out special programs above 100%", () => {
    expect(foirFrom("FOIR 50% – 65% Affordable Home Loans")).toBe(65);
    expect(foirFrom("FOIR up to 70% for salaried")).toBe(70);
    expect(foirFrom("Loan up to 25 Cr with 200% FOIR")).toBeNull();
    expect(foirFrom("FOIR to be checked, 3 months")).toBeNull();
  });
  it("reads the lowest credit score, ages and the longest tenure", () => {
    expect(creditScoreFrom("CIBIL score minimum 675. Cibil required 700")).toBe(675);
    expect(creditScoreFrom("As per CIBIL 3 months")).toBeNull();
    expect(agesFrom("age limits salaried 20-65 years, Age 24 to 70")).toEqual({ min: 20, max: 70 });
    expect(tenureMonthsFrom("Home Loan tenure up to 30 years; top-up tenure 15 years")).toBe(360);
  });
});

describe("rulesFromFlyers", () => {
  const sheet = { hlMin: 2_000_000, hlMax: 50_000_000, hlRoi: "9.5% to 11%", tenSalHL: 30, tenSepHL: 25, minCibil: 700 };
  it("fills blanks for a home loan from the rate sheet and notes", () => {
    const r = rulesFromFlyers({ product: "home-loan", sheet, notes: "FOIR up to 65%; LTV 80%" }, none);
    expect(r.patch).toMatchObject({ minAmount: 2_000_000, maxAmount: 50_000_000, minRate: 9.5, maxRate: 11, maxTenureMonths: 360, minCreditScore: 700, foirBands: [{ upTo: null, value: 65 }], ltvBands: [{ upTo: null, value: 80 }] });
  });
  it("never replaces a figure already entered", () => {
    const r = rulesFromFlyers({ product: "home-loan", sheet, notes: "FOIR 65%" }, { ...none, maxAmount: 10_000_000, minCreditScore: 750, foirBands: [{ upTo: null, value: 50 }] });
    expect(r.patch.maxAmount).toBeUndefined();
    expect(r.patch.minCreditScore).toBeUndefined();
    expect(r.patch.foirBands).toBeUndefined();
  });
  it("does not apply a property rate sheet or loan-to-value to a personal loan", () => {
    const r = rulesFromFlyers({ product: "personal-loan", sheet, notes: "LTV 80%" }, none);
    expect(r.patch.maxAmount).toBeUndefined();
    expect(r.patch.ltvBands).toBeUndefined();
  });
  it("clears a minimum that was only a copy of the maximum", () => {
    const r = rulesFromFlyers({ product: "home-loan" }, { ...none, minAmount: 2_500_000, maxAmount: 2_500_000 });
    expect(r.patch).toEqual({ minAmount: null });
  });
});

describe("special-program figures are left alone", () => {
  it("ignores a Low LTV program, a very low share and an income share above 80%", () => {
    expect(ltvFrom("Low LTV 60% program")).toBeNull();
    expect(ltvFrom("LTV 45% Industrial")).toBeNull();
    expect(foirFrom("FOIR upto 100% in Banking")).toBeNull();
  });
});
