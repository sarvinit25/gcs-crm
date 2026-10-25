import { describe, expect, it } from "vitest";
import { emi } from "./file-overview";

describe("emi", () => {
  it("matches the standard formula for a 10 lakh loan at 9% over 10 years", () => {
    expect(Math.round(emi(1_000_000, 9, 120)!)).toBe(12_668);
  });
  it("is unknown until the amount, rate and tenure are all known", () => {
    expect(emi(0, 9, 120)).toBeNull();
    expect(emi(1_000_000, 0, 120)).toBeNull();
    expect(emi(1_000_000, 9, 0)).toBeNull();
    expect(emi(Number.NaN, 9, 120)).toBeNull();
  });
});
