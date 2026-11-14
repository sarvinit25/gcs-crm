import ExcelJS from "exceljs";
import { analyseTxns, camFill, type StatementAnalysis } from "./statement-analyse";
import { csvRows, fromPdfText, fromRows, settle, StatementError, type Txn } from "./statement-parse";

// Takes an uploaded statement (text PDF, Excel .xlsx or CSV), reads it on our own server and returns the figures. The file is
// not kept and nothing is sent to any outside service: a statement carries account numbers and personal spending.

export const MAX_STATEMENT_BYTES = 15 * 1024 * 1024;

type TextItem = { str: string; transform: number[] };

/** One text line per row of the page, with a space between the pieces of a row (the library's own render glues them). */
const pageToLines = (pageData: { getTextContent: (o: object) => Promise<{ items: TextItem[] }> }) =>
  pageData.getTextContent({ normalizeWhitespace: true }).then((tc) => {
    const lines: string[] = [];
    let line = "";
    let lastY: number | null = null;
    for (const item of tc.items) {
      const y = item.transform[5]!;
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ""; }
      line += (line && !line.endsWith(" ") && !item.str.startsWith(" ") ? " " : "") + item.str;
      lastY = y;
    }
    lines.push(line);
    return lines.join("\n");
  });

async function pdfText(buf: Buffer): Promise<string> {
  // the library's index runs a self-test when imported on its own, so its inner file is imported
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer, o?: object) => Promise<{ text: string }>;
  try {
    return (await pdfParse(buf, { pagerender: pageToLines })).text;
  } catch (e) {
    if (/password/i.test(String((e as Error)?.message ?? e)) || (e as { name?: string })?.name === "PasswordException") {
      throw new StatementError("This PDF is locked with a password. Open it, enter the password, print it to a new PDF (or download the Excel version from net banking) and upload that.");
    }
    throw new StatementError("That PDF could not be read. Try the Excel or CSV version of the statement from net banking.");
  }
}

const plain = (v: ExcelJS.CellValue): unknown => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return plain(o.result as ExcelJS.CellValue);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text);
    return "";
  }
  return v;
};

async function xlsxRows(buf: Buffer): Promise<unknown[][][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new StatementError("That Excel file could not be opened.");
  }
  return wb.worksheets.map((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (c, col) => { cells[col - 1] = plain(c.value); });
      rows.push(Array.from(cells, (c) => c ?? ""));
    });
    return rows;
  });
}

export async function readStatement(buf: Buffer, fileName: string): Promise<{ analysis: StatementAnalysis; fill: ReturnType<typeof camFill>; kind: string }> {
  if (buf.length > MAX_STATEMENT_BYTES) throw new StatementError("That file is too big. Statements up to 15 MB can be read.");
  const name = fileName.toLowerCase();
  let txns: Txn[] = [];
  let kind = "";

  if (buf.subarray(0, 4).toString("latin1") === "%PDF") {
    kind = "PDF";
    const text = await pdfText(buf);
    if (text.replace(/\s/g, "").length < 200) {
      throw new StatementError("This PDF has no readable text: it looks like a scan or a photo. Upload the Excel or CSV statement from net banking instead.");
    }
    txns = settle(fromPdfText(text));
  } else if (buf.readUInt32LE(0) === 0x04034b50) {
    kind = "Excel";
    let best: Txn[] = [];
    for (const rows of await xlsxRows(buf)) {
      const got = settle(fromRows(rows));
      if (got.length > best.length) best = got;
    }
    txns = best;
  } else if (buf.readUInt32LE(0) === 0xe011cfd0) {
    throw new StatementError("That is an old .xls file. Open it in Excel and save it as .xlsx or CSV, then upload it again.");
  } else if (/\.(csv|txt)$/.test(name) || !buf.subarray(0, 2000).includes(0)) {
    kind = "CSV";
    txns = settle(fromRows(csvRows(buf.toString("utf8").replace(/^﻿/, ""))));
  } else {
    throw new StatementError("Upload a statement as a PDF with text, an Excel (.xlsx) file or a CSV.");
  }

  if (txns.length < 3) {
    throw new StatementError(kind === "PDF"
      ? "I could not find transaction rows in that PDF. Banks lay statements out differently: try the Excel or CSV version, or tell us which bank so the reader can be taught."
      : "I could not find the transaction table. It needs columns for the date, the narration or description, the debit and credit (or amount) and the balance.");
  }
  const analysis = analyseTxns(txns);
  return { analysis, fill: camFill(analysis), kind };
}
