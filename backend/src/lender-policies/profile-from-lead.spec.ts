import { fillProfileFromCam, profileFromLead } from "./profile-from-lead";

const rows = (o: Record<string, string>) => Object.entries(o).map(([label, value]) => ({ label, value }));

describe("a match profile built from everything known about a lead", () => {
  it("reads a self-employed customer's chat answers (Vinit's kind of chat)", () => {
    const p = profileFromLead({
      amount: 20000000, city: "Mumbai", employmentType: "SELF_EMPLOYED", monthlyIncome: null,
      answers: rows({
        "Type of property": "Commercial (shop / office)", "Approximate market value of the property": "₹5,00,00,000",
        "Roughly what is your CIBIL score?": "650 to 699", "Total EMIs you pay every month": "₹15,000",
        "How long has the business been running?": "3 to 5 years", "Is your business registered under GST?": "Yes, and returns are filed regularly",
        "Annual turnover (last financial year)": "₹2,00,00,000", "Rent you receive every month": "₹60,000",
        "Your age": "25 to 40", "Preferred repayment period": "10 to 15 years", "What does your business do?": "Trading in electronics",
      }),
    });
    expect(p).toMatchObject({
      amount: 20000000, city: "Mumbai", employmentType: "SELF_EMPLOYED", propertyType: "Commercial", propertyValue: 50000000, creditScore: 650,
      existingEmi: 15000, businessVintageMonths: 36, gstRegistered: true, annualTurnover: 20000000, rentalIncome: 60000, age: 33, tenureMonths: 180, industry: "Trading",
    });
  });

  it("never turns a band into a precise figure and leaves out what was not given", () => {
    const p = profileFromLead({ answers: rows({ "Roughly what is your CIBIL score?": "700 to 749", "Drawing power or unused limit available today": "Not sure (the expert will confirm)" }) });
    expect(p).toEqual({ creditScore: 700 });
  });

  it("reads 'below 650' and 'not sure' sensibly", () => {
    expect(profileFromLead({ answers: rows({ "Roughly what is your CIBIL score?": "Below 650" }) }).creditScore).toBe(600);
    expect(profileFromLead({ answers: rows({ "Preferred repayment period": "Not sure" }) }).tenureMonths).toBeUndefined();
  });

  it("starts from the lead's own fields when there are no answers", () => {
    expect(profileFromLead({ amount: 1500000, city: "Pune", employmentType: "SALARIED", monthlyIncome: 85000 })).toEqual({ amount: 1500000, city: "Pune", employmentType: "SALARIED", monthlyIncome: 85000 });
  });
});

describe("filling the profile from the CAM", () => {
  const cam = { applicant: { dob: "1979-07-01" }, property: { agreementValue: 9_603_077 }, obligations: { cibilScore: 720, loans: [{ emi: 10_000, status: "Live", foir: "Yes" }, { emi: 50_000, status: "Closed" }] }, income: { constitution: "Proprietorship", vintageYears: 31 } };
  it("fills only blanks", () => {
    const p = fillProfileFromCam({ creditScore: 650, amount: 5_000_000 }, cam, new Date("2026-11-25T00:00:00Z"));
    expect(p).toMatchObject({ creditScore: 650, propertyValue: 9_603_077, existingEmi: 10_000, age: 47, constitution: "Proprietorship", businessVintageMonths: 372, amount: 5_000_000 });
  });
  it("copes with no CAM", () => {
    expect(fillProfileFromCam({ amount: 1 }, null)).toEqual({ amount: 1 });
  });
});
