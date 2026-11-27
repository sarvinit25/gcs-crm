import { profileFromApplication } from "./profile-from-application";

const app = {
  requestedAmount: 33_000_000,
  tenureMonths: 240,
  applicants: [
    { isPrimary: true, city: "Thane", employmentType: "SELF_EMPLOYED", constitution: "LLP", dateOfBirth: new Date("1969-11-25T00:00:00Z"), monthlyIncome: 174_744, cibilScore: 777 },
    { isPrimary: false, monthlyIncome: 100_000 },
  ],
  creditEvaluation: { propertyValue: 40_000_000, annualTurnover: 62_556_793, netProfit: 1_040_299 },
  existingLoans: [{ emi: 134_809, counted: true }, { emi: 50_000, counted: false }],
};

describe("lender match profile from an application", () => {
  it("reads the applicants, the evaluation and the counted loans, over what the lead said", () => {
    const p = profileFromApplication(app, { city: "Mumbai", amount: 1, creditScore: 600 }, new Date("2026-11-27T00:00:00Z"));
    expect(p).toMatchObject({ amount: 33_000_000, city: "Thane", employmentType: "SELF_EMPLOYED", age: 57, creditScore: 777, monthlyIncome: 274_744, existingEmi: 134_809, propertyValue: 40_000_000, annualProfit: 1_040_299, tenureMonths: 240 });
  });
  it("keeps what the lead said where the application says nothing", () => {
    const p = profileFromApplication({ applicants: [{ isPrimary: true }] }, { city: "Pune", creditScore: 700, existingEmi: 5 });
    expect(p).toEqual({ city: "Pune", creditScore: 700, existingEmi: 5 });
  });
});
