import { appliesTo, cleanCriteria, coerceValue, fieldKey, missingMandatory, testCriterion, type MatchFieldDef } from "./match-fields";
import { matchAll, type PolicyRule, type Profile } from "./policy-matcher";

const NOW = new Date("2026-11-23T00:00:00Z");
const d = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const rule = (over: Partial<PolicyRule> = {}): PolicyRule => ({
  id: "p", lenderId: "l", lenderName: "Bank", active: true, effectiveFrom: d(100), effectiveTo: null, lastVerifiedAt: d(5), reviewEveryDays: 90,
  minAmount: 100_000, maxAmount: 5_000_000, minRate: 11, maxRate: 16, maxTenureMonths: 60, employmentTypes: ["SALARIED"], minAge: 21, maxAgeAtApplication: 60,
  maxAgeAtMaturity: 65, minMonthlyIncome: 30_000, minBusinessVintageMonths: null, minAnnualTurnover: null, minAnnualProfit: null, minCreditScore: 700,
  acceptedConstitutions: [], gstRequired: false, foirBands: [{ upTo: null, value: 55 }], ltvBands: null, acceptedPropertyTypes: [], allIndia: true, cities: [], ...over,
});
const num: MatchFieldDef = { key: "cards", label: "Credit cards held", type: "NUMBER", options: [], unit: "cards", products: [], applicants: [], mandatory: false, minValue: 0, maxValue: 50, active: true };
const yn: MatchFieldDef = { key: "overdue", label: "Any overdue EMI", type: "YESNO", options: [], products: [], applicants: [], mandatory: true, active: true };
const ch: MatchFieldDef = { key: "employer", label: "Employer type", type: "CHOICE", options: ["Government", "MNC", "Private"], products: [], applicants: ["SALARIED"], mandatory: false, active: true };
const FIELDS = [num, yn, ch];
const me: Profile = { amount: 1_000_000, city: "Mumbai", employmentType: "SALARIED", age: 35, monthlyIncome: 90_000, existingEmi: 10_000, creditScore: 750, product: "personal-loan" };

describe("match fields", () => {
  it("makes a safe key from a name", () => expect(fieldKey("  Any overdue EMI? ")).toBe("any_overdue_emi"));
  it("cleans answers to the field type and drops unusable ones", () => {
    expect(coerceValue(num, "3")).toBe(3);
    expect(coerceValue(num, "99")).toBeUndefined(); // above the allowed maximum
    expect(coerceValue(num, "abc")).toBeUndefined();
    expect(coerceValue(yn, "Yes")).toBe(true);
    expect(coerceValue(yn, "maybe")).toBeUndefined();
    expect(coerceValue(ch, "mnc")).toBe("MNC");
    expect(coerceValue(ch, "Startup")).toBeUndefined();
  });
  it("keeps only sensible tests on known fields", () => {
    const c = cleanCriteria({ cards: { op: "lte", value: "4" }, overdue: { op: "no" }, ghost: { op: "yes" }, employer: { op: "gte", value: 3 } }, FIELDS);
    expect(c).toEqual({ cards: { op: "lte", value: 4 }, overdue: { op: "no" } });
  });
  it("skips fields that do not apply", () => {
    expect(appliesTo(ch, { employmentType: "SELF_EMPLOYED" })).toBe(false);
    expect(appliesTo({ ...num, products: ["home-loan"] }, { product: "personal-loan" })).toBe(false);
    expect(appliesTo({ ...num, active: false }, {})).toBe(false);
  });
  it("explains a pass and a fail in plain words", () => {
    expect(testCriterion(num, { op: "lte", value: 4 }, 6)).toMatchObject({ ok: false });
    expect(testCriterion(num, { op: "lte", value: 4 }, 2).ok).toBe(true);
    expect(testCriterion(num, { op: "lte", value: 4 }, undefined).ok).toBeNull();
  });
  it("lists mandatory fields with no answer", () => {
    expect(missingMandatory(FIELDS, {}, { employmentType: "SALARIED" }).map((f) => f.key)).toEqual(["overdue"]);
    expect(missingMandatory(FIELDS, { overdue: false }, { employmentType: "SALARIED" })).toEqual([]);
  });
});

describe("matching on staff-defined fields", () => {
  const run = (fields: Profile["fields"], criteria: PolicyRule["criteria"]) => matchAll({ ...me, fields }, [rule({ criteria })], NOW, FIELDS)[0];
  it("rules a lender out when a condition on a confirmed policy fails", () => {
    const r = run({ cards: 7, overdue: false }, { cards: { op: "lte", value: 4 } });
    expect(r.category).toBe("NOT_MATCHED");
    expect(r.reasons.some((x) => x.code === "FIELD" && !x.ok)).toBe(true);
  });
  it("is Eligible when every condition passes", () => {
    const r = run({ cards: 2, overdue: false }, { cards: { op: "lte", value: 4 }, overdue: { op: "no" } });
    expect(r.category).toBe("ELIGIBLE");
    expect(r.reasons.filter((x) => x.code === "FIELD").every((x) => x.ok)).toBe(true);
  });
  it("is Conditional, not Eligible, when the answer is missing", () => {
    const r = run({}, { overdue: { op: "no" } });
    expect(r.category).toBe("CONDITIONAL");
    expect(r.checks.join(" ")).toContain("Any overdue EMI");
  });
  it("ignores a condition on a field that does not apply to this customer", () => {
    const r = matchAll({ ...me, employmentType: "SALARIED", fields: {} }, [rule({ criteria: { employer: { op: "in", value: ["MNC"] } } })], NOW, [{ ...ch, applicants: ["SELF_EMPLOYED"] }])[0];
    expect(r.reasons.some((x) => x.code === "FIELD")).toBe(false);
  });
  it("changes nothing for a policy with no conditions", () => {
    const r = run({ cards: 9 }, null);
    expect(r.category).toBe("ELIGIBLE");
  });
});
