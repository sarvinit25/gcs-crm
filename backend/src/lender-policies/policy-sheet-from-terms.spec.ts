import { roiText, sheetFromTerms } from "./policy-sheet-from-terms";

describe("roiText", () => {
  it("words a rate the way the one-pager does", () => {
    expect(roiText(8.75, null)).toBe("8.75% onwards");
    expect(roiText("8.75", "10.5")).toBe("8.75% to 10.5%");
    expect(roiText(null, 11)).toBe("up to 11%");
    expect(roiText(9, 9)).toBe("9%");
    expect(roiText(null, null)).toBeNull();
  });
});

describe("sheetFromTerms", () => {
  it("lays Home Loan and LAP figures into their own fields", () => {
    const s = sheetFromTerms([
      { productSlug: "home-loan", scheme: "Quasi", minAmount: 500000, maxAmount: 50000000, minRate: 8.5, maxRate: 10, maxTenureMonths: 360, processingFee: "0.5% + GST", employmentTypes: ["Salaried"], minCreditScore: 700 },
      { productSlug: "loan-against-property", minAmount: "1000000", minRate: 9.5, maxTenureMonths: 180 },
    ]);
    expect(s).toMatchObject({ scheme: "Quasi", hlMin: 500000, hlMax: 50000000, hlRoi: "8.5% to 10%", tenSalHL: 30, pfSalHL: 0.5, minCibil: 700, lapMin: 1000000, lapRoi: "9.5% onwards", tenSalLAP: 15, tenSepLAP: 15 });
    // a salaried-only Home Loan says nothing about the self-employed
    expect(s.tenSepHL).toBeUndefined();
    expect(s.pfSepHL).toBeUndefined();
  });
  it("ignores other loan types and unstated figures", () => {
    expect(sheetFromTerms([{ productSlug: "personal-loan", minAmount: 1, minRate: 10 }])).toEqual({});
    expect(sheetFromTerms([{ productSlug: "home-loan", processingFee: "Rs 5,000 flat" }])).toEqual({});
  });
  it("keeps the first figure when a product appears twice", () => {
    expect(sheetFromTerms([{ productSlug: "home-loan", minAmount: 100 }, { productSlug: "home-loan", minAmount: 200, maxAmount: 900 }])).toMatchObject({ hlMin: 100, hlMax: 900 });
  });
});
