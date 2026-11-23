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
  it("never recommends a stale or never-verified policy, but still shows how well it fits", () => {
    const verified = matchOne(customer, policy(), NOW);
    expect(["STRONG", "POSSIBLE"]).toContain(verified.status);

    const stale = matchOne(customer, policy({ lastVerifiedAt: daysAgo(120) }), NOW);
    expect(stale.status).toBe("EXPERT_REVIEW"); // never Strong or Possible on rules nobody has confirmed
    expect(stale.score).toBe(verified.score); // but the analysis is not thrown away
    expect(stale.policyNeedsReview).toBe(true);
    expect(stale.reasons.some((r) => r.code === "POLICY_STALE")).toBe(true);
    expect(stale.checks.join(" ")).toMatch(/Confirm this lender's current rules/);

    const never = matchOne(customer, policy({ lastVerifiedAt: null }), NOW);
    expect(never.status).toBe("EXPERT_REVIEW");
    expect(never.policyNeedsReview).toBe(true);
    expect(never.reasons.find((r) => r.code === "POLICY_STALE")?.text).toMatch(/never been verified/);
  });
  it("does not rule a lender out on rules nobody has verified: it asks a person instead", () => {
    const tooBig = matchOne({ ...customer, amount: 900_000_000 }, policy({ lastVerifiedAt: null }), NOW);
    expect(tooBig.status).toBe("EXPERT_REVIEW");
    expect(tooBig.reasons.some((r) => /above this lender's maximum/.test(r.text))).toBe(true);
    // the same miss on a verified policy does rule the lender out
    expect(matchOne({ ...customer, amount: 900_000_000 }, policy(), NOW).status).toBe("EXCLUDED");
  });
});

describe("matchOne hard filters", () => {
  it("excludes on location when a city list is recorded and does not include the city", () => {
    const p = policy({ allIndia: false, cities: ["Pune"] });
    expect(matchOne(customer, p, NOW).status).toBe("EXCLUDED");
    expect(matchOne({ ...customer, city: "pune" }, p, NOW).status).not.toBe("EXCLUDED");
  });
  it("still scores a lender whose service area is not recorded, but never calls it Strong or Possible", () => {
    const r = matchOne(customer, policy({ allIndia: false, cities: [] }), NOW);
    expect(r.status).toBe("EXPERT_REVIEW");
    expect(r.score).not.toBeNull();
    expect(r.reasons.some((x) => x.code === "LOCATION_UNKNOWN")).toBe(true);
    expect(r.checks.join(" ")).toMatch(/serves the customer's location/);
  });
  it("puts the better-fitting of two unverified lenders first", () => {
    const fits = policy({ lenderId: "a", lenderName: "Fits", lastVerifiedAt: null, id: "a" });
    const misses = policy({ lenderId: "b", lenderName: "Misses", lastVerifiedAt: null, id: "b", minCreditScore: 900 });
    const ranked = matchAll(customer, [misses, fits], NOW);
    expect(ranked.every((r) => r.status === "EXPERT_REVIEW")).toBe(true);
    expect(ranked[0]!.lenderName).toBe("Fits");
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

describe("Eligible, Conditional and Not matched", () => {
  const { categoryOf } = jest.requireActual("./policy-matcher");
  const ok = { code: "A", ok: true, text: "fine" };
  const bad = { code: "B", ok: false, text: "not met" };
  it("calls a lender Eligible only when everything checked is met on confirmed rules", () => {
    expect(categoryOf({ status: "STRONG", reasons: [ok], checks: [], policyNeedsReview: false })).toBe("ELIGIBLE");
    expect(categoryOf({ status: "STRONG", reasons: [ok], checks: ["close to the limit"], policyNeedsReview: false })).toBe("CONDITIONAL");
  });
  it("rules a lender out only on a failed criterion of confirmed rules", () => {
    expect(categoryOf({ status: "EXPERT_REVIEW", reasons: [ok, bad], checks: [], policyNeedsReview: false })).toBe("NOT_MATCHED");
    expect(categoryOf({ status: "EXPERT_REVIEW", reasons: [ok, bad], checks: [], policyNeedsReview: true })).toBe("CONDITIONAL");
    expect(categoryOf({ status: "EXPERT_REVIEW", reasons: [ok, bad], checks: [], policyNeedsReview: false, capped: true })).toBe("NOT_MATCHED");
    expect(categoryOf({ status: "EXCLUDED", reasons: [], checks: [], policyNeedsReview: false })).toBe("NOT_MATCHED");
  });
  it("does not count the price comparison as a failure", () => {
    expect(categoryOf({ status: "POSSIBLE", reasons: [ok, { code: "PRICING", ok: false, text: "higher" }], checks: [], policyNeedsReview: false })).toBe("CONDITIONAL");
  });
});

describe("category when the service area is not recorded", () => {
  it("still rules a lender out when the customer clearly fails a confirmed rule", () => {
    const r = matchAll({ ...customer, monthlyIncome: 40_000, existingEmi: 30_000 }, [policy({ allIndia: false, cities: [] })], NOW)[0];
    expect(r.category).toBe("NOT_MATCHED");
  });
  it("keeps it Conditional when the only gap is the unrecorded service area", () => {
    const r = matchAll(customer, [policy({ allIndia: false, cities: [] })], NOW)[0];
    expect(r.category).toBe("CONDITIONAL");
  });
});
