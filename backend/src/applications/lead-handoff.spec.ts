import { evaluationFromCam } from "./lead-handoff";

describe("evaluationFromCam", () => {
  const cam = {
    income: { financials: [{ year: "Last financial year", turnover: 1_000_000, netProfit: 420_000 }] },
    banking: { months: [{ credits: 119_764 }, { credits: 0 }, { credits: 3_141 }] },
    property: { marketValue: 34_500_000 },
    obligations: {
      loans: [
        { lender: "IDFC First Bank", type: "Loan against property", sanctioned: 13_100_000, emi: 114_515, monthsLeft: 268, foir: "No", status: "Will be closed from this loan" },
        { lender: "Hero FinCorp", type: "Personal loan", sanctioned: 500_000, outstanding: 380_000, emi: 19_355, monthsLeft: 31, foir: "Yes", status: "Live" },
        { lender: "Old car loan", status: "Closed", emi: 9_000 },
        { lender: "", emi: 1 },
      ],
    },
  };
  it("takes turnover, profit, average bank credits and property value", () => {
    const r = evaluationFromCam(cam, {});
    expect(r.inputs).toEqual({ annualTurnover: 1_000_000, netProfit: 420_000, avgMonthlyBankCredits: 40_968, propertyValue: 34_500_000 });
  });
  it("counts live loans, leaves out the one that will be closed and any closed or unnamed loan", () => {
    const r = evaluationFromCam(cam, {});
    expect(r.loans.map((l) => [l.lenderName, l.counted])).toEqual([["IDFC First Bank", false], ["Hero FinCorp", true]]);
    expect(r.loans[0]!.note).toContain("closed");
    expect(r.loans[1]!.outstanding).toBe(380_000);
  });
  it("copes with an empty or odd CAM", () => {
    expect(evaluationFromCam(null, {})).toEqual({ inputs: {}, loans: [] });
    expect(evaluationFromCam({ obligations: { loans: "x" }, banking: { months: [null] } }, {})).toEqual({ inputs: {}, loans: [] });
  });
});
