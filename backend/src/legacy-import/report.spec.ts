import { cleanRow, COL, mergePeople, type Cell, type CleanContext } from "./clean";
import { buildReport, reportMarkdown } from "./report";

const ctx: CleanContext = { batches: new Set(["KOTAK", "SHRIRAM"]), now: new Date("2026-11-19T00:00:00Z") };
const row = (o: Partial<Record<keyof typeof COL, Cell>>): Cell[] => {
  const r: Cell[] = Array.from({ length: 38 }, () => null);
  for (const [k, v] of Object.entries(o)) r[COL[k as keyof typeof COL]] = v as Cell;
  return r;
};

describe("staging report", () => {
  const rows = [
    cleanRow(row({ code: "KOTAK", customer: "Asha", mobile: "9820793681", product: "BL", amount: 1000000, remarks: "interested", callPerson: "Mahesh", callDate: new Date("2024-01-01T00:00:00Z") }), 2, ctx),
    cleanRow(row({ code: "KOTAK", customer: "Asha", mobile: "9820793681", remarks: "not interested", callPerson: "Sourish", callDate: new Date("2025-01-01T00:00:00Z") }), 3, ctx),
    cleanRow(row({ code: "SHRIRAM", customer: "Bala", mobile: "9987218284", product: "XYZ", scheme: "DISBURSED", amount: "7700921095", date: new Date("2013-01-01T00:00:00Z") }), 4, ctx),
    cleanRow(row({ code: "KOTAK", customer: "Chitra", mobile: "25862200", remarks: "DND" }), 5, ctx),
  ];
  const people = mergePeople(rows);
  const report = buildReport(rows, people);

  it("counts people after merging, and what became of each", () => {
    expect(report).toMatchObject({ sheetRows: 4, people: 3, mergedAway: 1, byCategory: { LIVE: 1, DEAD: 1, NEEDS_PHONE: 1 }, doNotCall: 1 });
    expect(report.deadReasons).toEqual({ "Not interested": 1 });
  });

  it("counts products, amounts and application records, saying what is missing", () => {
    expect(report.product.mapped).toBe(1);
    expect(report.product.unmappedTop.map(([k]) => k)).toEqual(expect.arrayContaining(["XYZ"]));
    expect(report.amount).toMatchObject({ usable: 1, flagged: { huge: 1 } });
    expect(report.applications).toMatchObject({ total: 1, complete: 0, byStatus: { DISBURSED: 1 } });
    expect(report.applications.missing).toEqual({ product: 1, amount: 1 });
  });

  it("counts the history by caller", () => {
    expect(report.history.byCaller).toEqual({ Mahesh: 1, Sourish: 1, "(nobody recorded)": 1 });
  });

  it("shows any notes it is given at the top", () => {
    expect(reportMarkdown(report, "Lead Data", ["54 rows held only formulas."])).toContain("- 54 rows held only formulas.");
  });

  it("writes a readable report and never includes a name or a number", () => {
    const md = reportMarkdown(report, "Lead Data");
    expect(md).toContain("People after merging on mobile: **3**");
    for (const secret of ["Asha", "Bala", "Chitra", "9820793681", "9987218284", "25862200"]) expect(md).not.toContain(secret);
  });
});
