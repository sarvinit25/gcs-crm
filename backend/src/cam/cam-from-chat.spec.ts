import { prefillFromAnswers } from "./cam-from-chat";
import { prefillFromLead } from "./cam.service";

const rows = (o: Record<string, string>) => Object.entries(o).map(([label, value]) => ({ label, value }));

describe("a CAM that starts from what the customer said in the chat", () => {
  const mahesh = prefillFromAnswers(
    rows({
      "Type of loan": "Drop-Line Overdraft Balance Transfer",
      "Which bank or finance company has it now?": "L&T Finance",
      "Your EMI for this loan": "₹1,55,000",
      "How regular has the repayment been?": "A few delays or bounces",
      "Briefly, what caused the delay or overdue?": "Customers paid late",
      "Type of property": "Other (Mixed-use building)",
      "Location of the property": "Vikhroli",
      "Approximate market value today": "₹6,00,00,000",
      "Whose name is the property in?": "A parent or family member",
      "Other regular monthly income (rent, interest, etc.)": "₹55,000",
      "Is the title clear, with all the original documents with you?": "Yes",
      "When would you like to move the loan?": "Within a month",
      "Your main bank": "HDFC Bank",
    }),
  ) as Record<string, Record<string, unknown>>;

  it("lays out the property, the loan being moved and the repayment conduct", () => {
    expect(mahesh.property).toMatchObject({ type: "Other", address: "Vikhroli", marketValue: 60000000, ownerName: "A parent or family member", titleClear: "Yes" });
    expect(mahesh.obligations!.loans).toEqual([{ lender: "L&T Finance", status: "Will be closed from this loan", emi: 155000 }]);
    expect(mahesh.obligations).toMatchObject({ overdue: "Yes", overdueDetails: "A few delays or bounces: Customers paid late" });
    expect(mahesh.loanRequest).toMatchObject({ timeline: "Within a month", existingBank: "HDFC Bank", security: "Other at Vikhroli" });
    expect(mahesh.income).toMatchObject({ otherIncome: 55000 });
    expect(mahesh.banking).toMatchObject({ mainBank: "HDFC Bank" });
  });

  it("never turns a band into a figure and skips what was not given", () => {
    const r = prefillFromAnswers(rows({ "Roughly what is your CIBIL score?": "700 to 749", "Drawing power or unused limit available today": "Not sure (the expert will confirm)", "Total work experience so far": "3 to 5 years" })) as Record<string, Record<string, unknown>>;
    expect(r.obligations?.cibilScore).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/700|749/);
  });

  it("reads a salaried customer's details", () => {
    const r = prefillFromAnswers(rows({ "Where do you work?": "Listed or MNC company", "How is the salary paid?": "Credited to a bank account", "Any late or missed EMI or card payments in the last 12 months?": "No", "Do you have any running loans or credit cards?": "Yes", "Bank or NBFC of your biggest running loan": "HDFC Bank", "What kind of loan is it?": "Car loan", "Amount still to be repaid": "₹2,40,000", "Its monthly EMI": "₹14,000", "Is there another running loan you would like to tell us about?": "No" })) as Record<string, Record<string, unknown>>;
    expect(r.income).toMatchObject({ employerType: "Listed company / MNC", salaryMode: "Bank transfer" });
    expect(r.obligations).toMatchObject({ overdue: "No", loans: [{ lender: "HDFC Bank", type: "Car loan", outstanding: 240000, emi: 14000, status: "Live" }] });
  });

  it("does not trust figures that two loans share a wording for", () => {
    const r = prefillFromAnswers(rows({ "Bank or NBFC of your biggest running loan": "HDFC Bank", "Amount still to be repaid": "₹2,40,000", "Its monthly EMI": "₹14,000", "Is there another running loan you would like to tell us about?": "Yes" })) as Record<string, Record<string, unknown>>;
    expect(r.obligations!.loans).toEqual([{ lender: "HDFC Bank", status: "Live" }]);
  });

  it("lets the lead's own details win over the chat", () => {
    const lead = { id: "l", leadNo: 1, name: "Mahesh", phone: "9867797192", secondaryPhone: null, email: null, city: "Mumbai", source: "whatsapp", amount: 30000000, dateOfBirth: null, pan: null, address: null, pincode: null, employmentType: "SALARIED", monthlyIncome: 85000, employerName: "Acme", designation: null, experienceYears: null, currentExperienceYears: null, assignedOfficerId: null, loanProductId: null, loanProduct: null, answers: rows({ "Name of your employer or business": "Chat Co", "Annual turnover": "₹1,00,00,000" }) };
    const cam = prefillFromLead(lead as never) as Record<string, Record<string, unknown>>;
    expect(cam.income).toMatchObject({ employer: "Acme", netMonthly: 85000 });
    expect(cam.income!.financials).toEqual([{ year: "Last financial year", turnover: 10000000 }]);
  });
});
