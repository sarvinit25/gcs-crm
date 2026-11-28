import ExcelJS from "exceljs";
import { fillFormulaResults } from "./formula-results";

describe("saving the answers beside a workbook's formulas", () => {
  it("works out the kinds of formula the CAM uses, across sheets", () => {
    const wb = new ExcelJS.Workbook();
    const a = wb.addWorksheet("Ratios");
    a.getCell("B1").value = 100;
    a.getCell("B2").value = 40;
    const b = wb.addWorksheet("Policy checks");
    const cases: [string, unknown][] = [
      ["IFERROR(Ratios!B1/Ratios!C1,\"-\")", "-"],
      ["N(Ratios!B1)+Ratios!B2*2", 180],
      ["IF(NOT(ISNUMBER(A9)),\"Not known\",\"Pass\")", "Not known"],
      ["SUMPRODUCT(--((Ratios!B1:B2+Ratios!B1:B2)>90))", 1],
      ["INDEX(Ratios!B1:B2,MATCH(MAX(Ratios!B1:B2),Ratios!B1:B2,0))", 100],
      ["ROUND(PMT(8.85/1200,240,-33000000),0)", 293734],
      ["'Policy checks'!A2&\" ok\"", "180 ok"],
      ["COUNTIF(A3:A3,\"Not known\")", 1],
    ];
    cases.forEach(([formula], i) => (b.getCell(i + 1, 1).value = { formula } as ExcelJS.CellValue));
    const r = fillFormulaResults(wb);
    expect(r.left).toEqual([]);
    expect(cases.map((_, i) => (b.getCell(i + 1, 1).value as { result: unknown }).result)).toEqual(cases.map(([, want]) => want));
  });
});
