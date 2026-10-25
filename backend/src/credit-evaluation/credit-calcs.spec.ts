import { dscr, emi, foir, loanForEmi, ltv, roomForEmi, variancePercent } from "./credit-calcs";

describe("credit calculations", () => {
  it("works out an EMI, and the loan an EMI can carry gets back to the amount", () => {
    expect(Math.round(emi(1_000_000, 9, 120)!)).toBe(12_668);
    expect(Math.round(loanForEmi(emi(2_500_000, 10.5, 180)!, 10.5, 180)!)).toBe(2_500_000);
    expect(emi(1_000_000, 0, 120)).toBeNull();
    expect(loanForEmi(0, 9, 120)).toBeNull();
  });

  it("FOIR is existing plus proposed EMI over income, and unknown without income or a proposed EMI", () => {
    expect(foir(10_000, 20_000, 60_000)).toBe(50);
    expect(foir(0, 20_000, 0)).toBeNull();
    expect(foir(0, null, 60_000)).toBeNull();
  });

  it("leaves room for a new EMI up to the FOIR ceiling, never below zero", () => {
    expect(roomForEmi(100_000, 50, 20_000)).toBe(30_000);
    expect(roomForEmi(40_000, 50, 30_000)).toBe(0);
  });

  it("DSCR adds back depreciation and interest, over the year's instalments", () => {
    expect(dscr(600_000, 100_000, 100_000, 640_000)).toBe(1.25);
    expect(dscr(600_000, 0, 0, 0)).toBeNull();
  });

  it("measures how far a figure is from the one stated, and LTV", () => {
    expect(variancePercent(8_000_000, 10_000_000)).toBe(-20);
    expect(variancePercent(1, 0)).toBeNull();
    expect(ltv(4_000_000, 5_000_000)).toBe(80);
    expect(ltv(4_000_000, 0)).toBeNull();
  });
});
