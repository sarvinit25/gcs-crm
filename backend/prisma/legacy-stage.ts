/**
 * Phase 1 of bringing the firm's old calling workbook into the CRM: read it, clean it, merge the repeats, and write a
 * review report. It changes NOTHING in the CRM and does not touch the database.
 *
 *   npm run legacy:stage -- <workbook.xlsx> <output-folder>
 *
 * The output folder holds customer details (people.jsonl), so it must be OUTSIDE this project and is never committed.
 * report.md and report.json hold counts only. See docs/DATA-MIGRATION.md.
 */
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import ExcelJS from "exceljs";
import { batchCodes, cleanRow, type Cell, type StagedRow } from "../src/legacy-import/clean";
import { mergePeople } from "../src/legacy-import/clean";
import { buildReport, reportMarkdown } from "../src/legacy-import/report";

const SHEET = "Lead Data";
const WIDTH = 38;

/** Whatever ExcelJS hands back for a cell, as a plain string, number, date or nothing. */
function plain(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return plain(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
  }
  return null;
}

type Read = { rows: { values: Cell[]; line: number }[]; formulaOnlyRows: number };

async function readRows(path: string): Promise<Read> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, { worksheets: "emit", sharedStrings: "cache", hyperlinks: "ignore", styles: "cache" });
  const rows: Read["rows"] = [];
  let formulaOnlyRows = 0;
  for await (const sheet of reader) {
    if ((sheet as unknown as { name: string }).name !== SHEET) continue; // the typings omit name; it exists at runtime
    let line = 0;
    for await (const row of sheet) {
      line += 1;
      if (line === 1) continue; // headings
      const cells = Array.from({ length: WIDTH }, (_, i) => row.getCell(i + 1).value);
      const values = cells.map(plain);
      if (values.every((v) => v === null || v === "")) {
        // A row of formulas the workbook never calculated holds no data; it is counted so the totals reconcile.
        if (cells.some((c) => c !== null && c !== undefined && c !== "")) formulaOnlyRows += 1;
        continue;
      }
      rows.push({ values, line });
    }
    return { rows, formulaOnlyRows }; // the other sheets are not read
  }
  throw new Error(`The workbook has no sheet called "${SHEET}".`);
}

async function main() {
  const [workbook, outArg] = process.argv.slice(2);
  if (!workbook || !outArg) {
    console.error("Usage: npm run legacy:stage -- <workbook.xlsx> <output-folder>");
    process.exit(1);
  }
  const out = resolve(outArg);
  const project = resolve(process.cwd(), "..");
  if (out === project || out.startsWith(project + sep)) {
    console.error(`Refusing to write into the project folder (${project}): the output holds customer details and must never be committed. Choose a folder outside it.`);
    process.exit(1);
  }
  mkdirSync(out, { recursive: true, mode: 0o700 });

  console.log(`Reading "${SHEET}" from ${workbook} ...`);
  const { rows: raw, formulaOnlyRows } = await readRows(resolve(workbook));
  const ctx = { batches: batchCodes(raw.map((r) => r.values)), now: new Date() };
  const rows: StagedRow[] = raw.map((r) => cleanRow(r.values, r.line, ctx));
  const people = mergePeople(rows);
  const report = buildReport(rows, people);

  const stream = createWriteStream(join(out, "people.jsonl"), { mode: 0o600 });
  for (const p of people) stream.write(JSON.stringify(p) + "\n");
  await new Promise<void>((done) => stream.end(done));
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  const notes = formulaOnlyRows ? [`${formulaOnlyRows} rows held only formulas the workbook never calculated, so they have no data and were skipped.`] : [];
  writeFileSync(join(out, "report.md"), reportMarkdown(report, SHEET, notes), { mode: 0o600 });

  console.log(`\nRead ${report.sheetRows} rows${formulaOnlyRows ? ` (${formulaOnlyRows} formula-only rows with no data skipped)` : ""} -> ${report.people} people`);
  console.log(`  live ${report.byCategory.LIVE} | archived history ${report.byCategory.DEAD} (do-not-call ${report.doNotCall}) | needs phone ${report.byCategory.NEEDS_PHONE}`);
  console.log(`  application records to create: ${report.applications.total} (${report.applications.complete} complete)`);
  console.log(`\nReport: ${join(out, "report.md")}\nStaged people (customer details, keep private): ${join(out, "people.jsonl")}\nNothing was changed in the CRM.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
