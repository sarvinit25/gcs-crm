import { cleanConditions, cleanProgram, cleanPrograms, mergeConditions, mergePrograms, programLine } from "./policy-extras";

describe("conditions", () => {
  it("keep only known keys, typed", () => {
    expect(cleanConditions({ rating: "BBB- and above", dscr: "1.2", payableDays: 120, collateralMarginPct: "20%", junk: "x", moratoriumMonths: -3 })).toEqual({ rating: "BBB- and above", dscr: 1.2, payableDays: 120, collateralMarginPct: 20 });
  });
  it("drop anything out of range or not text or number", () => {
    expect(cleanConditions({ collateralMarginPct: 250, dscr: "abc", endUse: { a: 1 } })).toEqual({});
    expect(cleanConditions("nope")).toEqual({});
  });
  it("fill only blanks when merged", () => {
    const m = mergeConditions({ rating: "A", dscr: 1.5 }, { rating: "BBB-", guarantee: "PG/CG required" });
    expect(m.conditions).toEqual({ rating: "A", dscr: 1.5, guarantee: "PG/CG required" });
    expect(m.filled).toEqual(["Guarantee"]);
  });
});

describe("programs", () => {
  const itr = { name: "ITR Program", maxAmount: 10000000, maxTenureMonths: 240, minAge: 25, maxAge: 70, who: "2 years regular ITR, 3 years business", ltv: "up to 80%", documents: ["ITR 2 years"] };
  it("are cleaned: a name is needed, ranges put the right way round, LTV must be a percentage", () => {
    expect(cleanProgram({ maxAmount: 5 })).toBeNull();
    const p = cleanProgram({ ...itr, minAmount: 9000000, maxAmount: 1000000, ltv: "residential only" })!;
    expect(p.minAmount).toBe(1000000);
    expect(p.maxAmount).toBe(9000000);
    expect(p.ltv).toBeNull();
    expect(p.minAge).toBe(25);
  });
  it("are listed once each and capped", () => {
    expect(cleanPrograms([itr, { ...itr, name: "itr  program" }, { name: "Low LTV" }])).toHaveLength(2);
    expect(cleanPrograms(Array.from({ length: 30 }, (_, i) => ({ name: `P${i}` })))).toHaveLength(12);
  });
  it("merge by adding new ones and filling blanks, never replacing", () => {
    const have = cleanPrograms([{ name: "ITR Program", maxAmount: 8000000 }]);
    const m = mergePrograms(have, cleanPrograms([itr, { name: "Banking Program", maxAmount: 5000000 }]));
    expect(m.added).toEqual(["Banking Program"]);
    expect(m.filled).toEqual(["ITR Program"]);
    const merged = m.programs.find((p) => p.name === "ITR Program")!;
    expect(merged.maxAmount).toBe(8000000); // what was held stays
    expect(merged.maxTenureMonths).toBe(240); // a blank was filled
  });
  it("read as one line", () => {
    expect(programLine(cleanProgram(itr)!)).toBe("ITR Program: up to ₹1 Cr · 20 yrs · LTV up to 80%");
  });
});
