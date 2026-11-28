import { camFromProfile } from "./cam-from-profile";
import { loansSeen } from "./statement-analyse";

describe("filling the CAM from profile answers", () => {
  const answers = { "biz-vintage": "2014", "biz-constitution": "LLP", "tx-type": "Resale Property", "rs-type": "Flat", "rs-mv": "40000000", "coapp": "Yes", "coapp-relation": "Spouse", "loan-1-bank": "Axis Bank", "loan-1-emi": "134809", "loan-1-original": "15200000" };
  it("fills property, business and loans, replacing a statement's guess at the lender and dropping an empty twin", () => {
    const r = camFromProfile({ obligations: { loans: [{ lender: "Axis Bank", sanctioned: 15200000 }, { lender: "Axis Bank (from bank statement, confirm)", emi: 134809 }] } }, answers, "Thane", new Date("2026-11-28T00:00:00Z"));
    expect(r.property).toMatchObject({ status: "Resale", type: "Residential flat", marketValue: 40000000, city: "Thane" });
    expect(r.income).toMatchObject({ vintageYears: 12, constitution: "LLP" });
    expect(r.obligations!.loans).toEqual([expect.objectContaining({ lender: "Axis Bank", emi: 134809 })]);
  });
  it("never replaces a saved answer", () => {
    expect(camFromProfile({ property: { marketValue: 1 } }, answers).property!.marketValue).toBe(1);
  });
});

describe("loans seen in a statement", () => {
  const e = (label: string, amount: number, times: number, last: string) => ({ label, amount, times, total: amount * times, last });
  it("takes instalments still running, naming the lender, and leaves out ended or one-off ones", () => {
    const r = loansSeen({ to: "2026-11-19", monthsFound: 8, emis: [e("ACH DR L TFINANCELTD P1", 69595, 7, "2026-11-03"), e("ACH DR OLD LENDER", 5000, 6, "2026-06-01"), e("ACH DR AXIS BANK", 90000, 1, "2026-11-10")] });
    expect(r).toEqual([{ lender: "L&T Finance (from bank statement, confirm)", emi: 69595, status: "Live", paid: 7 }]);
  });
});
