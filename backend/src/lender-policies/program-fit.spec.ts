import { cleanProgram } from "./policy-extras";
import { fitPrograms } from "./program-fit";
import { matchAll, type PolicyRule } from "./policy-matcher";

const prog = (o: Record<string, unknown>) => cleanProgram(o)!;
const income = prog({ name: "Income Program", maxAmount: 150000000, maxFoirPct: 80, maxLtvPct: 75, maxTenureMonths: 180, minRate: 9 });
const lowLtv = prog({ name: "Low LTV Program", maxAmount: 20000000, minBusinessVintageMonths: 36, occupancy: "Self-occupied", abbMultiple: 1, status: { abbMultiple: "PENDING" } });
const gst = prog({ name: "GST Program", rules: [{ label: "GST turnover", value: "Subject to GST turnover and business profile", status: "PENDING" }] });
const fb = { rate: 9, tenureMonths: 180 };

describe("judging each program on its own rules", () => {
  it("tells which program fits and which is missed, and by how much", () => {
    const r = fitPrograms({ amount: 30000000, propertyValue: 40000000, monthlyIncome: 600000, existingEmi: 0, businessVintageMonths: 60 }, [lowLtv, income], fb);
    const low = r.find((x) => x.name === "Low LTV Program")!;
    expect(low.verdict).toBe("MISSES");
    expect(low.gaps[0]).toMatch(/₹1 Cr above/);
    const inc = r.find((x) => x.name === "Income Program")!;
    expect(inc.verdict).toBe("FITS");
  });
  it("flags LTV over the limit with the excess", () => {
    const r = fitPrograms({ amount: 32000000, propertyValue: 40000000 }, [income], fb)[0]!;
    expect(r.verdict).toBe("MISSES");
    expect(r.gaps.join(" ")).toMatch(/allows 75%.*₹20 L too much/);
  });
  it("says what is still unknown instead of guessing", () => {
    const r = fitPrograms({ amount: 10000000 }, [lowLtv], fb)[0]!;
    expect(r.verdict).toBe("MAYBE");
    expect(r.needs.join(" ")).toMatch(/business has been running/);
    expect(r.needs.join(" ")).toMatch(/Average bank balance/);
    expect(r.needs.join(" ")).toMatch(/Self-occupied/);
  });
  it("lists rules the lender has not confirmed", () => {
    expect(fitPrograms({ amount: 10000000 }, [lowLtv], fb)[0]!.unconfirmed).toEqual(["ABB multiple"]);
    expect(fitPrograms({ amount: 10000000 }, [gst], fb)[0]!.unconfirmed).toEqual(["GST turnover"]);
  });
  it("puts the best fit first", () => {
    const r = fitPrograms({ amount: 1000000, propertyValue: 4000000, monthlyIncome: 500000, businessVintageMonths: 12 }, [lowLtv, income], fb);
    expect(r[0]!.name).toBe("Income Program");
  });
});

describe("a policy's programs in the matcher", () => {
  const rule = (extra: Partial<PolicyRule> = {}): PolicyRule => ({
    id: "p", lenderId: "l", lenderName: "Bandhan Bank", active: true, effectiveFrom: new Date("2026-01-01"), effectiveTo: null, lastVerifiedAt: new Date(), reviewEveryDays: 90,
    minAmount: null, maxAmount: 150000000, minRate: 9, maxRate: null, maxTenureMonths: 180, employmentTypes: [], minAge: null, maxAgeAtApplication: null, maxAgeAtMaturity: null,
    minMonthlyIncome: null, minBusinessVintageMonths: null, minAnnualTurnover: null, minAnnualProfit: null, minCreditScore: null, acceptedConstitutions: [], gstRequired: false,
    foirBands: null, ltvBands: null, acceptedPropertyTypes: [], allIndia: true, cities: [], programs: [income, lowLtv], ...extra,
  });
  it("adds the program view without touching score or status", () => {
    const profile = { amount: 30000000, propertyValue: 50000000 };
    const without = matchAll(profile, [rule({ programs: [] })])[0]!;
    const withP = matchAll(profile, [rule()])[0]!;
    expect(withP.status).toBe(without.status);
    expect(withP.score).toBe(without.score);
    expect(withP.programFit?.map((x) => x.name).sort()).toEqual(["Income Program", "Low LTV Program"]);
    expect(without.programFit).toBeUndefined();
  });
  it("cleans programs that carry no structure (older records)", () => {
    expect(cleanProgram({ name: "Old", maxAmount: 1000000 })).toMatchObject({ rules: [], status: {}, employmentTypes: [], maxFoirPct: null });
  });
});
