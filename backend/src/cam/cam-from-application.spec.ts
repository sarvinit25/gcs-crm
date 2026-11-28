import { analyse } from "./cam-analysis";
import { camFromApplication, checklistName, type CamApplication } from "./cam-from-application";

const app: CamApplication = {
  tenureMonths: 240,
  applicants: [
    { isPrimary: true, name: "ZZ TEST", employmentType: "SELF_EMPLOYED", constitution: "LLP", monthlyIncome: 174744, cibilScore: 777, dateOfBirth: new Date("1969-11-25T00:00:00Z") },
    { isPrimary: false, name: "ZZ CO", relation: "Spouse", cibilScore: 700, monthlyIncome: 50000 },
  ],
  existingLoans: [
    { lenderName: "Axis Bank", loanType: "Home loan", emi: 134809, counted: true },
    { lenderName: "Axis Bank", loanType: "Car loan", emi: 67993, counted: true },
  ],
  references: [{ name: "R", phone: "9000000031" }],
  documents: [{ category: "KYC", fileName: "PAN CARD.pdf" }],
  sanction: { interestRate: "8.85", tenureMonths: 240 },
};

describe("a CAM reading its application", () => {
  const start = { loanRequest: { amount: 33_000_000 }, obligations: { loans: [{ lender: "Axis Bank", sanctioned: 15_200_000 }] } };
  const out = camFromApplication(start, app);

  it("fills co-applicants, loans, score, documents and the sanctioned rate", () => {
    expect(out.obligations!.cibilScore).toBe(777);
    expect(out.obligations!.loans).toHaveLength(2);
    expect((out.obligations!.loans as { emi: number; sanctioned?: number }[])[0]).toMatchObject({ emi: 134809, sanctioned: 15_200_000 });
    expect(out.loanRequest!.coApplicants).toEqual([expect.objectContaining({ name: "ZZ CO", cibil: 700, monthlyIncome: 50000 })]);
    expect(out.loanRequest!.tenureYears).toBe(20);
    expect(out.documents!.list).toEqual([expect.objectContaining({ document: "PAN card", status: "Received" })]);
    expect(out.remarks!.assumedRate).toBe(8.85);
  });
  it("never replaces what was written in the CAM", () => {
    expect(camFromApplication({ obligations: { cibilScore: 650 }, remarks: { assumedRate: 10 } }, app)).toMatchObject({ obligations: { cibilScore: 650 }, remarks: { assumedRate: 10 } });
  });
  it("takes a partner's own return, not the firm's profit, for an LLP", () => {
    const data = { ...out, income: { ...out.income, financials: [{ year: "2024-25", turnover: 62_556_793, netProfit: 1_040_299 }] } };
    const a = analyse("HOME", data);
    expect(a.monthlyIncome).toBe(174744 + 50000);
    expect(a.existingEmi).toBe(202802);
    expect(a.programs.map((p) => p.key)).toEqual(["declared", "cash", "net"]);
  });
  it("sets aside a market value far below the agreement, and says so", () => {
    const a = analyse("HOME", { loanRequest: { amount: 33_000_000 }, property: { agreementValue: 35_000_000, marketValue: 22_973_666 } });
    expect(a.property.value).toBe(35_000_000);
    expect(a.property.ltv).toBe(94.3);
    expect(a.flags.some((f) => /market value/i.test(f.text))).toBe(true);
  });
  it("names the checklist line of a file", () => {
    expect(checklistName("Bank statement", "x.pdf")).toBe("Bank statements, last 6 to 12 months");
    expect(checklistName("Other", "scan.pdf")).toBe("Other");
  });
});
