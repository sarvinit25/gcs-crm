import { describe, expect, it } from "vitest";
import { emi, netOfDeductions, percentAmount } from "./loan-math";

describe("emi", () => {
  it("gives the reducing-balance figure the server will also compute", () => {
    expect(emi(1700000, 10.5, 60)).toBe(36539.63);
    expect(emi(1700000, 10.5, 120)).toBe(22938.95);
  });
  it("handles a zero rate and refuses missing inputs", () => {
    expect(emi(120000, 0, 12)).toBe(10000);
    expect(emi(null, 10, 12)).toBeNull();
    expect(emi(100000, 10, 0)).toBeNull();
  });
});

describe("netOfDeductions", () => {
  it("ignores blanks and NaN", () => {
    expect(netOfDeductions(100000, [1000, undefined, NaN, 500.5])).toBe(98499.5);
  });
});

describe("percentAmount", () => {
  it("is a percentage of the base, or null for junk", () => {
    expect(percentAmount(1700000, 1)).toBe(17000);
    expect(percentAmount(NaN, 1)).toBeNull();
  });
});
