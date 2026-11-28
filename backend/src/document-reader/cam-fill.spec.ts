import { belongsToApplicant, camFromExtraction, isNewLoanPaper, limitToFileKind, onlyBlanks } from "./cam-fill";
import { normaliseReading } from "./document-reading";

describe("camFromExtraction", () => {
  it("cleans a tax return into a financial year", () => {
    const r = camFromExtraction({ financials: [{ year: "2024-2025", netProfit: "6,28,028", turnover: "n/a", depreciation: -4 }], business: { businessName: "Shanti Stores", constitution: "proprietorship" } });
    expect(r).toEqual({ income: { businessName: "Shanti Stores", constitution: "Proprietorship", financials: [{ year: "2024-25", netProfit: 628_028 }] } });
  });
  it("keeps a loss as a negative profit and needs a lender and an EMI for a loan", () => {
    expect(camFromExtraction({ financials: [{ year: "2023-24", netProfit: -5000 }] })!.income!.financials).toEqual([{ year: "2023-24", netProfit: -5000 }]);
    expect(camFromExtraction({ loans: [{ lender: "X" }, { emi: 5 }] })).toBeNull();
    expect(camFromExtraction({ loans: [{ lender: "X", emi: "12,000", type: "nonsense" }] })!.obligations!.loans).toEqual([{ lender: "X", emi: 12_000, type: "Other", status: "Live" }]);
  });
  it("returns nothing for rubbish", () => {
    expect(camFromExtraction("x")).toBeNull();
    expect(camFromExtraction({ property: { agreementValue: "unknown" } })).toBeNull();
  });
});

describe("onlyBlanks", () => {
  const have = { income: { netMonthly: 50_000, financials: [{ year: "2024-25", netProfit: 100 }] }, obligations: { loans: [{ lender: "Hero", emi: 5000 }] }, banking: { months: [{ month: "a" }] } };
  it("never replaces what is there", () => {
    const r = onlyBlanks(have, { income: { netMonthly: 90_000, employer: "Acme" }, banking: { months: [{ month: "b" }] } });
    expect(r.patch).toEqual({ income: { employer: "Acme" } });
    expect(r.filled).toEqual(["income.employer"]);
  });
  it("fills missing cells of a known year and adds new years, newest first", () => {
    const r = onlyBlanks(have, { income: { financials: [{ year: "2024-25", netProfit: 999, turnover: 500 }, { year: "2023-24", netProfit: 80 }] } });
    expect(r.patch.income!.financials).toEqual([{ year: "2024-25", netProfit: 100, turnover: 500 }, { year: "2023-24", netProfit: 80 }]);
  });
  it("adds only a loan not already listed", () => {
    const r = onlyBlanks(have, { obligations: { loans: [{ lender: "hero", emi: 5000 }, { lender: "IDFC", emi: 7000 }] } });
    expect(r.patch.obligations!.loans).toHaveLength(2);
    expect(onlyBlanks(have, { obligations: { loans: [{ lender: "Hero", emi: 5000 }] } }).filled).toEqual([]);
  });
});

describe("what each kind of document may fill", () => {
  const raw = { business: { businessName: "A" }, financials: [{ year: "2024-25", netProfit: 5 }], property: { agreementValue: 9 }, loans: [{ lender: "X", emi: 1 }] };
  it("lets a return fill the business and the years only", () => {
    expect(Object.keys(normaliseReading({ docType: "ITR", ...raw }).cam!)).toEqual(["income"]);
  });
  it("lets a property paper fill only the property, and an unknown paper nothing", () => {
    expect(Object.keys(normaliseReading({ docType: "PROPERTY_PAPER", ...raw }).cam!)).toEqual(["property"]);
    expect(normaliseReading({ docType: "OTHER", ...raw }).cam).toBeNull();
  });
});

describe("whose document it is", () => {
  const names = ["Pramod Manohar Padave"];
  it("accepts the applicant and their firm, and a document with no name", () => {
    expect(belongsToApplicant("Mr. Pramod M Padave", names, [])).toBe(true);
    expect(belongsToApplicant("SHANTI STATIONERY & GENERAL STORE", ["Ramesh Jain"], ["Shanti Stationary & General Stores", "Shanti Stationery"])).toBe(true);
    expect(belongsToApplicant(null, names, [])).toBe(true);
  });
  it("rejects a spouse who shares the middle name and surname, and the spouse's firm", () => {
    expect(belongsToApplicant("Prerna Pramod Padave", names, ["G C Chemie Pharmie Ltd Co"])).toBe(false);
    expect(belongsToApplicant("Prachi Beauty Parlour Classes", names, ["G C Chemie Pharmie Ltd Co"])).toBe(false);
  });
  it("knows a sanction letter from a loan statement by its name", () => {
    expect(isNewLoanPaper("Bajaj HL SL 42 L - Pramod Padave .pdf")).toBe(true);
    expect(isNewLoanPaper("Part Disbursement Details L&T.jpeg")).toBe(true);
    expect(isNewLoanPaper("SOA IDFC Car Loan 7.65 L.pdf")).toBe(false);
  });
});

describe("registration numbers", () => {
  it("drops values that are not a GSTIN or Udyam number", () => {
    expect(camFromExtraction({ business: { gstin: "No", udyam: "registered" } })).toBeNull();
    expect(camFromExtraction({ business: { udyam: "UDYAM-MH-33-0689325" } })!.income!.udyam).toBe("UDYAM-MH-33-0689325");
  });
});

describe("what a file's own kind allows", () => {
  const patch = { income: { gstin: "x", financials: [{ year: "2024-25" }], netMonthly: 5 }, property: { areaSqft: 1 }, obligations: { loans: [] } };
  it("lets a property paper fill only the property", () => {
    expect(limitToFileKind(patch, "Property papers")).toEqual({ property: { areaSqft: 1 } });
  });
  it("takes yearly figures only from income proof", () => {
    expect(limitToFileKind(patch, "Income proof").income).toHaveProperty("financials");
    expect(limitToFileKind(patch, "Business proof").income).not.toHaveProperty("financials");
    expect(limitToFileKind(patch, "Other").income).toEqual({ netMonthly: 5 });
  });
});

describe("accounts, a personal return and GST months", () => {
  it("cleans them from the AI's answer", () => {
    const r = camFromExtraction({ balanceSheet: [{ year: "2024-2025", netWorth: "10,00,000", debtors: "n/a" }], personal: { totalIncome: 2_096_930 }, gstMonths: [{ month: "October-26", sales: 5 }, { month: "FY 2026", sales: 9 }] });
    expect(r).toEqual({ income: { balanceSheet: [{ year: "2024-25", netWorth: 1_000_000 }], declaredMonthly: 174_744 }, gst: { months: [{ month: "Oct 2026", sales: 5 }] } });
  });
  it("gathers GST months from many returns, newest first, without repeating one", () => {
    const r = onlyBlanks({ gst: { months: [{ month: "Sept 2026", sales: 1 }] } }, { gst: { months: [{ month: "Oct 2026", sales: 2 }, { month: "Sep 2026", sales: 9 }] } });
    expect(r.patch.gst!.months).toEqual([{ month: "Oct 2026", sales: 2 }, { month: "Sept 2026", sales: 1 }]);
  });
  it("fills balance sheet years like financial years", () => {
    const r = onlyBlanks({ income: { balanceSheet: [{ year: "2024-25", netWorth: 5 }] } }, { income: { balanceSheet: [{ year: "2024-25", netWorth: 9, debtors: 2 }] } });
    expect(r.patch.income!.balanceSheet).toEqual([{ year: "2024-25", netWorth: 5, debtors: 2 }]);
  });
});
