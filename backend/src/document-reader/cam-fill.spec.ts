import { camFromExtraction, onlyBlanks } from "./cam-fill";
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
