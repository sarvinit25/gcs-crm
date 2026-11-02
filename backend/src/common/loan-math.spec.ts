import { emi, feeAmount, netOfDeductions, percentOf } from "./loan-math";

describe("emi", () => {
  it("matches the standard reducing-balance figure", () => {
    // ₹10,00,000 at 10% for 120 months
    expect(emi(1000000, 10, 120)).toBe(13215.07);
    // ₹17,00,000 at 10.5% for 60 months
    expect(emi(1700000, 10.5, 60)).toBe(36539.63);
  });

  it("divides evenly when the rate is zero", () => {
    expect(emi(120000, 0, 12)).toBe(10000);
  });

  it("returns null rather than guessing when an input is missing or unusable", () => {
    expect(emi(null, 10, 60)).toBeNull();
    expect(emi(1000000, undefined, 60)).toBeNull();
    expect(emi(1000000, 10, 0)).toBeNull();
    expect(emi(0, 10, 60)).toBeNull();
    expect(emi(1000000, -1, 60)).toBeNull();
  });
});

describe("feeAmount", () => {
  it("prefers a flat sum, falls back to a percentage of the base", () => {
    expect(feeAmount(1000000, 1, 5000)).toBe(5000);
    expect(feeAmount(1000000, 1.5, undefined)).toBe(15000);
    expect(feeAmount(undefined, 1.5, undefined)).toBeNull();
  });
});

describe("netOfDeductions", () => {
  it("takes every deduction off, ignoring blanks", () => {
    expect(netOfDeductions(1700000, [25000, null, 3000.5, undefined])).toBe(1671999.5);
    expect(netOfDeductions(500000, [])).toBe(500000);
  });
});

describe("percentOf", () => {
  it("rounds to two places and survives a zero base", () => {
    expect(percentOf(15000, 1700000)).toBe(0.88);
    expect(percentOf(10, 0)).toBe(0);
  });
});
