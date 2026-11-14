import { cleanSheet, fillSheet, SHEET_FIELDS, SHEET_SECTIONS, sheetProgress, sheetPromptLines } from "./policy-sheet-schema";
import { normalizeExtraction } from "../lender-offers/offer-extraction";

describe("the policy one-pager", () => {
  it("covers every part of the bank's format", () => {
    const keys = new Set(SHEET_FIELDS.map((f) => f.key));
    for (const k of ["loginFeeHL", "loginFeeLAP", "loginMode", "hlMin", "lapMax", "cpMax", "hlRoi", "roiDependsOn", "pfSalHL", "pfSepLAP", "pfMin", "pfMax", "minCibil", "cibilDeviation", "topUpMax", "topUpUpToBps", "topUpAboveBps", "foirSal", "foirSep", "rentalIncome", "bankingProgram", "lowLtvProgram", "lipProgram", "aipProgram", "tenSalHL", "tenProfLAP", "ltvSorp", "ltvRentedRes", "ltvVacantRes", "ltvSocp", "ltvRentedComm", "ltvIndustrial", "ltvIndustrialOffice", "legal", "technical", "admin", "insurance", "mod", "prepayment", "otherCharges", "productsOpen", "specialScheme", "usp", "preferredProfile", "restrictions", "deviationProgram", "rmName", "rmDesignation", "rmMobile", "rmEmail", "rmLocation", "effectiveDate", "validity", "conditionalCharges"]) {
      expect(keys.has(k)).toBe(true);
    }
    expect(SHEET_SECTIONS.length).toBeGreaterThanOrEqual(13);
    expect(keys.size).toBe(SHEET_FIELDS.length); // no key used twice
  });

  it("keeps what fits its type and leaves the rest blank", () => {
    const d = cleanSheet({ loginFeeHL: "₹ 5,000", hlRoi: "8.75% onwards", minCibil: "700", foirSal: 140, rentalIncome: "yes", loginMode: "Either Mode", productsOpen: ["Home Loan", "Moon Loan"], effectiveDate: "2026-02-31", rmMobile: "+91 98765 43210", rmEmail: "nope", unknown: "x", usp: "  " });
    expect(d).toEqual({ loginFeeHL: 5000, hlRoi: "8.75% onwards", minCibil: 700, rentalIncome: "Yes", loginMode: "Either Mode", productsOpen: ["Home Loan"], rmMobile: "9876543210" });
  });

  it("fills blanks only, and says what the flyer said differently", () => {
    const held = cleanSheet({ hlRoi: "9% onwards", foirSal: 60 });
    const { data, filled, differs } = fillSheet(held, cleanSheet({ hlRoi: "8.5% onwards", foirSal: 60, foirSep: 70, legal: "₹3,000" }));
    expect(data.hlRoi).toBe("9% onwards"); // a value already held is never overwritten
    expect(data.foirSep).toBe(70);
    expect(data.legal).toBe("₹3,000");
    expect(filled.sort()).toEqual(["Legal charges", "Self-employed FOIR, up to (%)"]);
    expect(differs).toEqual([{ label: "Home Loan ROI", held: "9% onwards", flyer: "8.5% onwards" }]);
  });

  it("reports how much is filled and what is still blank", () => {
    expect(sheetProgress({}).percent).toBe(0);
    const p = sheetProgress(cleanSheet({ hlRoi: "9%", minCibil: 700 }));
    expect(p.percent).toBeGreaterThan(0);
    expect(p.missing).not.toContain("Home Loan ROI");
    expect(p.missing).toContain("Legal charges");
  });

  it("is what the flyer reader is asked for, and what it hands back is cleaned", () => {
    expect(sheetPromptLines()).toContain("hlRoi: Rate of interest (ROI) - Home Loan ROI");
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [], policySheet: { lapRoi: "9.5% onwards", ltvSorp: "70", bogus: 1 } }, new Set());
    expect(x.sheet).toEqual({ lapRoi: "9.5% onwards", ltvSorp: 70 });
    expect(normalizeExtraction({ kind: "OTHER", policySheet: { lapRoi: "9%" } }, new Set()).sheet).toEqual({});
  });
});
