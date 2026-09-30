import ExcelJS from "exceljs";
import { buildReportCsv, buildReportWorkbook, type ReportMeta } from "./report-workbook";
import type { RecordColumn } from "./reports.service";

const meta: ReportMeta = {
  title: "Applications Report",
  generatedAt: "2026-09-30T10:00:00.000Z",
  generatedBy: "GCS Admin",
  company: { name: "Growth Capital Services", legalName: "", address: "Ghatkopar West, Mumbai", phone: "8828001700", email: "a@b.in", gstin: "", pan: "" },
  filters: [{ label: "Period", value: "All time" }],
  summary: [{ label: "Total records", value: 2, kind: "count" }],
  truncated: false,
};
const columns: RecordColumn[] = [
  { key: "no", label: "Application no.", type: "text" },
  { key: "date", label: "Created", type: "date" },
  { key: "amount", label: "Requested amount", type: "amount" },
  { key: "status", label: "Status", type: "text" },
];
const rows = [
  { no: "GCS-2026-0001", date: "2026-09-29", amount: 4500000, status: "BANK_LOGIN" },
  { no: "GCS-2026-0002", date: "2026-09-30", amount: 2500000, status: "SANCTIONED" },
];

async function read() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildReportWorkbook(meta, columns, rows)) as never);
  return wb.worksheets[0];
}

describe("report workbook", () => {
  it("carries the company letterhead, title and filters", async () => {
    const ws = await read();
    const text: string[] = [];
    ws.eachRow((r) => r.eachCell((c) => text.push(String(c.value ?? ""))));
    expect(text).toContain("Growth Capital Services");
    expect(text).toContain("Applications Report");
    expect(text.some((t) => t.includes("All time"))).toBe(true);
  });

  it("writes real dates on the right calendar day and numeric amounts", async () => {
    const ws = await read();
    let found = false;
    ws.eachRow((r) => {
      if (r.getCell(1).value === "GCS-2026-0001") {
        found = true;
        expect((r.getCell(2).value as Date).toISOString().slice(0, 10)).toBe("2026-09-29");
        expect(r.getCell(3).value).toBe(4500000);
        expect(r.getCell(4).value).toBe("Bank login");
      }
    });
    expect(found).toBe(true);
  });

  it("adds a TOTAL row summing every amount column", async () => {
    const ws = await read();
    let formula: unknown;
    ws.eachRow((r) => {
      if (r.getCell(1).value === "TOTAL") formula = (r.getCell(3).value as { formula: string }).formula;
    });
    expect(String(formula)).toMatch(/^SUM\(C\d+:C\d+\)$/);
  });

  it("produces a CSV with the same letterhead and a total", () => {
    const csv = buildReportCsv(meta, columns, rows);
    expect(csv).toContain("Growth Capital Services");
    expect(csv).toContain("Applications Report");
    expect(csv).toContain("GCS-2026-0002,30 Sep 2026,2500000,Sanctioned");
    expect(csv).toContain("TOTAL,,7000000");
  });
});
