import ExcelJS from "exceljs";
import type { ColumnType, RecordColumn } from "./reports.service";
import { prettify } from "./reports.service";
import { formatDateIST, formatDateTimeIST } from "../common/date.util";

export type ReportMeta = {
  title: string;
  generatedAt: string;
  generatedBy: string;
  company: { name: string; legalName: string; address: string; phone: string; email: string; gstin: string; pan: string };
  filters: { label: string; value: string }[];
  summary: { label: string; value: number; kind: "count" | "amount" }[];
  truncated: boolean;
};

const NAVY = "FF0B1849";
const GOLD = "FFE4B028";
const PALE = "FFF7F8FA";
const LINE = "FFE3E7EE";

const NUM_FORMAT: Record<ColumnType, string | undefined> = {
  text: undefined,
  // Indian digit grouping (12,34,567) via a conditional format — plain #,##,##0 groups in thousands.
  amount: '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"##,##0',
  date: "dd mmm yyyy",
  percent: '0.00"%"',
  number: "0",
};

const WIDTH: Record<ColumnType, number> = { text: 22, amount: 18, date: 14, percent: 10, number: 10 };

const istStamp = (iso: string) => formatDateTimeIST(new Date(iso));

function cellValue(col: RecordColumn, raw: unknown) {
  if (raw === null || raw === undefined || raw === "") return null;
  // Excel stores dates as UTC serials; using UTC midnight keeps the calendar day intact.
  if (col.type === "date") return new Date(`${raw}T00:00:00Z`);
  if (col.type === "amount" || col.type === "percent" || col.type === "number") return Number(raw);
  return prettify(raw) as string;
}

/** A print-ready report: letterhead, filters, headline numbers, then the table with totals. */
export async function buildReportWorkbook(
  meta: ReportMeta,
  columns: RecordColumn[],
  rows: Record<string, unknown>[],
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.company.name || "GCS CRM";
  wb.created = new Date(meta.generatedAt);
  const ws = wb.addWorksheet(meta.title.slice(0, 31), {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });

  const last = Math.max(columns.length, 6);
  ws.columns = Array.from({ length: last }, (_, i) => ({ width: columns[i] ? WIDTH[columns[i].type] : 14 }));
  // Text columns that usually hold longer values get more room.
  columns.forEach((c, i) => {
    if (c.type === "text" && /customer|lender|email|partner|loanType|officer|owner/i.test(c.key)) ws.getColumn(i + 1).width = 28;
  });

  const merged = (r: number, value: string, style: Partial<ExcelJS.Style> & { height?: number }) => {
    ws.mergeCells(r, 1, r, last);
    const cell = ws.getCell(r, 1);
    cell.value = value;
    const { height, ...rest } = style;
    Object.assign(cell, { style: rest });
    if (height) ws.getRow(r).height = height;
  };

  let r = 1;
  merged(r++, meta.company.name || "Growth Capital Services", {
    font: { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } },
    alignment: { vertical: "middle", indent: 1 },
    height: 32,
  });
  const legal = [meta.company.legalName && meta.company.legalName !== meta.company.name ? meta.company.legalName : "", meta.company.address]
    .filter(Boolean)
    .join(" · ");
  const contact = [
    meta.company.phone && `Tel ${meta.company.phone}`,
    meta.company.email,
    meta.company.gstin && `GSTIN ${meta.company.gstin}`,
    meta.company.pan && `PAN ${meta.company.pan}`,
  ]
    .filter(Boolean)
    .join("  |  ");
  for (const line of [legal, contact].filter(Boolean)) {
    merged(r++, line, {
      font: { size: 10, color: { argb: "FFFFFFFF" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } },
      alignment: { vertical: "middle", indent: 1, wrapText: true },
      height: 16,
    });
  }
  ws.getRow(r).height = 4;
  for (let c = 1; c <= last; c++) ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  r += 2;

  merged(r++, meta.title, { font: { size: 15, bold: true, color: { argb: NAVY } }, height: 24 });
  merged(r++, `Generated ${istStamp(meta.generatedAt)} IST  ·  by ${meta.generatedBy}`, { font: { size: 10, color: { argb: "FF525C72" } } });
  r++;

  // Filters
  merged(r++, "FILTERS APPLIED", { font: { size: 9, bold: true, color: { argb: "FF525C72" } } });
  for (const f of meta.filters) {
    ws.getCell(r, 1).value = f.label;
    ws.getCell(r, 1).font = { size: 10, color: { argb: "FF525C72" } };
    ws.mergeCells(r, 2, r, Math.min(last, 4));
    ws.getCell(r, 2).value = f.value;
    ws.getCell(r, 2).font = { size: 10, bold: true };
    r++;
  }
  r++;

  // Headline numbers
  merged(r++, "SUMMARY", { font: { size: 9, bold: true, color: { argb: "FF525C72" } } });
  for (const s of meta.summary) {
    const label = ws.getCell(r, 1);
    label.value = s.label;
    label.font = { size: 10 };
    ws.mergeCells(r, 1, r, 2);
    const value = ws.getCell(r, 3);
    value.value = s.value;
    value.numFmt = s.kind === "amount" ? NUM_FORMAT.amount! : "#,##0";
    value.font = { size: 10, bold: true, color: { argb: NAVY } };
    value.alignment = { horizontal: "right" };
    for (let c = 1; c <= 3; c++) ws.getCell(r, c).border = { bottom: { style: "hair", color: { argb: LINE } } };
    r++;
  }
  r++;

  // Table
  const headerRow = r;
  columns.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", wrapText: true, horizontal: c.type === "amount" || c.type === "percent" || c.type === "number" ? "right" : "left" };
  });
  ws.getRow(r).height = 28;
  r++;

  rows.forEach((row, idx) => {
    columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = cellValue(c, row[c.key]);
      const fmt = NUM_FORMAT[c.type];
      if (fmt) cell.numFmt = fmt;
      cell.font = { size: 10 };
      cell.alignment = { vertical: "middle", horizontal: c.type === "text" ? "left" : c.type === "date" ? "center" : "right" };
      cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE } };
    });
    r++;
  });

  // Totals row for every amount column
  const amountCols = columns.map((c, i) => ({ c, i })).filter(({ c }) => c.type === "amount");
  if (rows.length && amountCols.length) {
    columns.forEach((_, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E3B8" } };
      cell.font = { bold: true, size: 10, color: { argb: NAVY } };
      cell.border = { top: { style: "thin", color: { argb: NAVY } } };
    });
    ws.getCell(r, 1).value = "TOTAL";
    for (const { i } of amountCols) {
      const col = ws.getColumn(i + 1).letter;
      const cell = ws.getCell(r, i + 1);
      cell.value = { formula: `SUM(${col}${headerRow + 1}:${col}${r - 1})` };
      cell.numFmt = NUM_FORMAT.amount!;
      cell.alignment = { horizontal: "right" };
    }
    r++;
  }

  if (!rows.length) {
    merged(r++, "No records match these filters.", { font: { italic: true, color: { argb: "FF525C72" } }, alignment: { horizontal: "center" } });
  }
  if (meta.truncated) {
    merged(r++, "Some records were left out because the report is very large — narrow the filters.", { font: { size: 9, italic: true, color: { argb: "FFB45309" } } });
  }
  r++;
  merged(r, `${meta.company.name || "GCS"} · Confidential — for internal use`, { font: { size: 8, color: { argb: "FF8A93A6" } } });

  ws.views = [{ showGridLines: false, state: "frozen", ySplit: headerRow }];
  if (rows.length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: columns.length } };
  ws.headerFooter.oddFooter = "&L&8&A&C&8Page &P of &N&R&8Generated " + istStamp(meta.generatedAt);
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The same letterhead and summary as the Excel report, as plain CSV. */
export function buildReportCsv(meta: ReportMeta, columns: RecordColumn[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const line = (...cells: unknown[]) => cells.map(esc).join(",");
  const fmt = (c: RecordColumn, v: unknown) => {
    if (v === null || v === undefined || v === "") return "";
    if (c.type === "date") return formatDateIST(new Date(`${v}T00:00:00+05:30`));
    return String(prettify(v));
  };

  const out: string[] = [];
  out.push(line(meta.company.name));
  const legal = [meta.company.legalName !== meta.company.name ? meta.company.legalName : "", meta.company.address].filter(Boolean).join(" · ");
  if (legal) out.push(line(legal));
  const contact = [meta.company.phone && `Tel ${meta.company.phone}`, meta.company.email, meta.company.gstin && `GSTIN ${meta.company.gstin}`, meta.company.pan && `PAN ${meta.company.pan}`].filter(Boolean).join("  |  ");
  if (contact) out.push(line(contact));
  out.push("", line(meta.title), line("Generated", `${istStamp(meta.generatedAt)} IST`, "by", meta.generatedBy), "");
  out.push(line("FILTERS APPLIED"), ...meta.filters.map((f) => line(f.label, f.value)), "");
  out.push(line("SUMMARY"), ...meta.summary.map((s) => line(s.label, s.value)), "");
  out.push(line(...columns.map((c) => c.label)));
  for (const row of rows) out.push(line(...columns.map((c) => fmt(c, row[c.key]))));
  const amountCols = columns.filter((c) => c.type === "amount");
  if (rows.length && amountCols.length) {
    out.push(line(...columns.map((c, i) => (i === 0 ? "TOTAL" : c.type === "amount" ? rows.reduce((s, r) => s + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0) : ""))));
  }
  if (meta.truncated) out.push("", line("Some records were left out because the report is very large — narrow the filters."));
  return "﻿" + out.join("\r\n") + "\r\n";
}
