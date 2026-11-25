import ExcelJS from "exceljs";
import { analyse } from "./cam-analysis";
import { buildCamWorkbook } from "./cam-workbook";
import { extraSheetsFor } from "./cam-extra-sheets";
import type { CamData, Family } from "./cam-schema";

const data = {
  income: {
    profile: "Self-employed business",
    projectedSales: 3_000_000,
    financials: [
      { year: "2025-26", turnover: 2_400_000, grossProfit: 900_000, netProfit: 600_000, depreciation: 50_000, interestPaid: 120_000, remuneration: 200_000, tax: 60_000 },
      { year: "2024-25", turnover: 2_000_000, grossProfit: 700_000, netProfit: 500_000, depreciation: 40_000, interestPaid: 100_000, remuneration: 150_000, tax: 50_000 },
    ],
    balanceSheet: [
      { year: "2025-26", netWorth: 1_500_000, bankDebt: 400_000, currentAssets: 900_000, currentLiabilities: 450_000, debtors: 300_000, inventory: 200_000, creditors: 150_000 },
      { year: "2024-25", netWorth: 1_200_000, bankDebt: 500_000, currentAssets: 700_000, currentLiabilities: 400_000, debtors: 250_000, inventory: 150_000, creditors: 120_000 },
    ],
  },
  loanRequest: { amount: 2_000_000, tenureYears: 5 },
  obligations: { loans: [{ lender: "Test Bank", type: "Personal loan", sanctioned: 400_000, outstanding: 300_000, emi: 12_000, monthsLeft: 30, paid: 6, status: "Live", foir: "Yes" }] },
} as unknown as CamData;

async function book(family: Family, d: CamData = data) {
  const buf = await buildCamWorkbook({
    lead: { leadNo: 1, name: "Test", phone: "9000000000", email: null, city: "Mumbai", productName: "Business Loan", source: null },
    family, data: d, analysis: analyse(family, d, new Date("2026-11-25T00:00:00Z")), match: null, matchNote: null,
    company: { name: "GCS", phone: "1", email: "a@b.c" }, generatedBy: "t", generatedAt: "now", customerSubmittedAt: null,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  return wb;
}
const formulas = (ws: ExcelJS.Worksheet) => {
  const out: string[] = [];
  ws.eachRow((row) => row.eachCell((c) => { const v = c.value as { formula?: string }; if (v && typeof v === "object" && v.formula) out.push(v.formula); }));
  return out;
};

describe("extra CAM sheets", () => {
  it("picks sheets by product and customer", () => {
    expect(extraSheetsFor("BUSINESS", { profile: "SELF_EMPLOYED" })).toEqual(["Ratios", "Eligibility methods", "Repayment track", "Working capital MPBF", "Fund flow", "Repayment schedule"]);
    expect(extraSheetsFor("HOME", { profile: "SALARIED" })).toEqual(["Repayment track", "Repayment schedule"]);
    expect(extraSheetsFor("LAP", { profile: "SELF_EMPLOYED" })).not.toContain("Working capital MPBF");
  });
  it("builds a business CAM whose new sheets are all formulas that point at real cells", async () => {
    const wb = await book("BUSINESS");
    for (const name of extraSheetsFor("BUSINESS", { profile: "SELF_EMPLOYED" })) {
      const ws = wb.getWorksheet(name)!;
      expect(ws).toBeDefined();
      const f = formulas(ws);
      expect(f.length).toBeGreaterThan(3);
      for (const x of f) expect(x).not.toMatch(/undefined|NaN|\[object/);
    }
    expect(formulas(wb.getWorksheet("Eligibility methods")!).some((x) => x.includes("Ratios!"))).toBe(true);
  });
  it("gives a salaried home loan only the repayment track and schedule", async () => {
    const wb = await book("HOME", { income: { profile: "Salaried", netMonthly: 100_000 }, loanRequest: { amount: 3_000_000, tenureYears: 20 } } as never);
    expect(wb.getWorksheet("Ratios")).toBeUndefined();
    expect(wb.getWorksheet("Repayment schedule")).toBeDefined();
  });
});
