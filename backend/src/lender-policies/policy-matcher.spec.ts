import { emi, matchAll, matchOne, pickBand, type PolicyRule, type Profile } from "./policy-matcher";

const NOW = new Date("2026-10-13T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const policy = (over: Partial<PolicyRule> = {}): PolicyRule => ({
  id: "p1",
  lenderId: "l1",
  lenderName: "Bank A",
  active: true,
  effectiveFrom: daysAgo(200),
  effectiveTo: null,
  lastVerifiedAt: daysAgo(10),
  reviewEveryDays: 90,
  minAmount: 500_000,
  maxAmount: 50_000_000,
  minRate: 8.5,
  maxRate: 9.5,
  maxTenureMonths: 240,
  employmentTypes: ["SALARIED", "SELF_EMPLOYED"],
  minAge: 21,
  maxAgeAtApplication: 60,
  maxAgeAtMaturity: 70,
  minMonthlyIncome: 30_000,
  minBusinessVintageMonths: null,
  minAnnualTurnover: null,
  minAnnualProfit: null,
  minCreditScore: 700,
  acceptedConstitutions: [],
  gstRequired: false,
  foirBands: [{ upTo: null, value: 55 }],
  ltvBands: [{ upTo: null, value: 80 }],
  acceptedPropertyTypes: [],
  allIndia: true,
  cities: [],
  ...over,
});

const customer: Profile = {
  amount: 5_000_000,
  city: "Mumbai",
  employmentType: "SALARIED",
  age: 35,
  monthlyIncome: 150_000,
  existingEmi: 10_000,
  creditScore: 750,
  propertyValue: 8_000_000,
};

describe("emi / pickBand", () => {
  it("computes a standard EMI", () => {
    expect(Math.round(emi(5_000_000, 9, 240))).toBe(44_986);
  });
  it("handles a zero rate", () => {
    expect(emi(120_000, 0, 12)).toBe(10_000);
  });
  it("picks the first band whose ceiling covers the value, null meaning no ceiling", () => {
    const bands = [{ upTo: null, value: 40 }, { upTo: 50_000, value: 30 }];
    expect(pickBand(bands, 40_000)?.value).toBe(30);
    expect(pickBand(bands, 90_000)?.value).toBe(40);
    expect(pickBand(null, 1)).toBeNull();
  });
});

describe("matchOne data-quality gates", () => {
  it("excludes an inactive or out-of-date policy", () => {
    expect(matchOne(customer, policy({ active: false }), NOW).status).toBe("EXCLUDED");
    expect(matchOne(customer, policy({ effectiveTo: daysAgo(1) }), NOW).status).toBe("EXCLUDED");
    expect(matchOne(customer, policy({ effectiveFrom: new Date("2027-01-01") }), NOW).status).toBe("EXCLUDED");
  });
  it("sends a stale or never-verified policy to a human and does not score it", () => {
    const stale = matchOne(customer, policy({ lastVerifiedAt: daysAgo(120) }), NOW);
    expect(stale.status).toBe("EXPERT_REVIEW");
    expect(stale.score).toBeNull();
    expect(stale.policyNeedsReview).toBe(true);
    expect(matchOne(customer, policy({ lastVerifiedAt: null }), NOW).policyNeedsReview).toBe(true);
  });
});

describe("matchOne hard filters", () => {
  it("excludes on location when a city list is recorded and does not include the city", () => {
    const p = policy({ allIndia: false, cities: ["Pune"] });
    expect(matchOne(customer, p, NOW).status).toBe("EXCLUDED");
    expect(matchOne({ ...customer, city: "pune" }, p, NOW).status).not.toBe("EXCLUDED");
  });
  it("routes to a human when serviceability is not recorded at all", () => {
    expect(matchOne(customer, policy({ allIndia: false, cities: [] }), NOW).status).toBe("EXPERT_REVIEW");
  });
  it("excludes an amount outside the lender's range", () => {
    expect(matchOne({ ...customer, amount: 100_000_000 }, policy(), NOW).status).toBe("EXCLUDED");
    expect(matchOne({ ...customer, amount: 100_000 }, policy(), NOW).status).toBe("EXCLUDED");
  });
  it("excludes on age, including age at maturity", () => {
    expect(matchOne({ ...customer, age: 19 }, policy(), NOW).status).toBe("EXCLUDED");
    expect(matchOne({ ...customer, age: 58 }, policy(), NOW).status).toBe("EXCLUDED"); // 58 + 20y > 70
  });
  it("excludes an unaccepted constitution, property type or applicant type", () => {
    expect(matchOne({ ...customer, constitution: "Proprietorship" }, policy({ acceptedConstitutions: ["LLP"] }), NOW).status).toBe("EXCLUDED");
    expect(matchOne({ ...customer, propertyType: "Plot" }, policy({ acceptedPropertyTypes: ["Residential"] }), NOW).status).toBe("EXCLUDED");
    expect(matchOne(customer, policy({ employmentTypes: ["SELF_EMPLOYED"] }), NOW).status).toBe("EXCLUDED");
  });
});

describe("matchOne scoring", () => {
  it("rates a clean profile as a strong match with reasons", () => {
    const r = matchOne(customer, policy(), NOW);
    expect(r.status).toBe("STRONG");
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.reasons.every((x) => x.ok)).toBe(true);
  });
  it("routes a FOIR miss to expert review instead of excluding", () => {
    const r = matchOne({ ...customer, monthlyIncome: 60_000 }, policy(), NOW);
    expect(r.status).toBe("EXPERT_REVIEW");
    expect(r.reasons.find((x) => x.code === "FOIR")?.ok).toBe(false);
  });
  it("flags a case close to a limit for checking", () => {
    // 5M @ 9.5% / 20y = ~46.6k; plus 10k = 56.6k; limit 55% of 105k = 57.75k → close
    const r = matchOne({ ...customer, monthlyIncome: 105_000 }, policy(), NOW);
    expect(r.checks.join(" ")).toMatch(/close to the lender's limit/);
  });
  it("routes an LTV or credit miss to expert review", () => {
    expect(matchOne({ ...customer, propertyValue: 5_500_000 }, policy(), NOW).status).toBe("EXPERT_REVIEW");
    expect(matchOne({ ...customer, creditScore: 650 }, policy(), NOW).status).toBe("EXPERT_REVIEW");
  });
  it("does not guess when little is known", () => {
    const r = matchOne({ city: "Mumbai" }, policy(), NOW);
    expect(r.status).toBe("EXPERT_REVIEW");
  });
  it("never reads payout or commission: the policy type has no such field", () => {
    expect(Object.keys(policy()).some((k) => /commission|payout/i.test(k))).toBe(false);
  });
});

describe("matchAll", () => {
  it("orders strong before possible before review before excluded", () => {
    const list = matchAll(
      customer,
      [
        policy({ id: "x", lenderName: "Excluded", active: false }),
        policy({ id: "r", lenderName: "Review", minCreditScore: 800 }),
        policy({ id: "s", lenderName: "Strong" }),
      ],
      NOW,
    );
    expect(list.map((r) => r.policyId)).toEqual(["s", "r", "x"]);
  });
  it("lets recorded pricing nudge the order between otherwise equal lenders", () => {
    const list = matchAll(
      customer,
      [policy({ id: "dear", lenderName: "Dear", minRate: 10, maxRate: 11 }), policy({ id: "cheap", lenderName: "Cheap", minRate: 8.5, maxRate: 9 })],
      NOW,
    );
    expect(list[0]!.policyId).toBe("cheap");
  });
});
