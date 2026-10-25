import { BadRequestException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";

export const MAX_IMPORT_ROWS = 500;

export type ImportRow = {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  product?: string;
  amount?: number;
  channel?: string;
  notes?: string;
};

/** Header text people actually type, mapped to the field it means. Compared with letters only, any case. */
const HEADERS: Record<string, keyof ImportRow> = {
  name: "name",
  contactpersonname: "name",
  contactperson: "name",
  fullname: "name",
  customername: "name",
  phone: "phone",
  mobile: "phone",
  mobilenumber: "phone",
  phonenumber: "phone",
  email: "email",
  emailaddress: "email",
  city: "city",
  product: "product",
  loantype: "product",
  loanproduct: "product",
  amount: "amount",
  loanamount: "amount",
  source: "channel",
  leadsource: "channel",
  channel: "channel",
  notes: "notes",
  remarks: "notes",
};

const key = (header: string) => header.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("result" in v) return v.result === null || v.result === undefined ? "" : cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text).trim(); // a hyperlink: its visible text
    return "";
  }
  return String(v).trim();
}

/**
 * Reads the leads out of an uploaded Excel (.xlsx) or CSV file. The first row must name a "name" and a
 * "phone" column; other columns are optional. `sheetRows` holds each returned row's own line number in the
 * file, so a problem can be reported against the row the person sees.
 */
export async function parseLeadFile(buffer: Buffer, fileName: string): Promise<{ rows: ImportRow[]; sheetRows: number[] }> {
  const workbook = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;
  try {
    if (/\.csv$/i.test(fileName)) {
      sheet = await workbook.csv.read(Readable.from(buffer));
    } else {
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      sheet = workbook.worksheets[0];
    }
  } catch {
    throw new BadRequestException("That file could not be read. Upload an Excel (.xlsx) or CSV file, ideally the downloaded template.");
  }
  if (!sheet) throw new BadRequestException("The file has no sheets.");

  const columns = new Map<keyof ImportRow, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const field = HEADERS[key(cellText(cell.value))];
    if (field && !columns.has(field)) columns.set(field, col);
  });
  if (!columns.has("name") || !columns.has("phone")) {
    throw new BadRequestException('The first row must have "Name" and "Phone" columns. Download the template to start from.');
  }

  const rows: ImportRow[] = [];
  const sheetRows: number[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const text = (f: keyof ImportRow) => (columns.has(f) ? cellText(row.getCell(columns.get(f)!).value) : "");
    const values = (["name", "phone", "email", "city", "product", "amount", "channel", "notes"] as const).map(text);
    if (!values.some(Boolean)) continue; // a blank line is not a lead
    const [name, phone, email, city, product, amount, channel, notes] = values;
    const parsed = amount ? Number(amount.replace(/[,₹\s]/g, "")) : undefined;
    rows.push({
      name,
      phone,
      email: email || undefined,
      city: city || undefined,
      product: product || undefined,
      amount: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
      channel: channel ? channel.slice(0, 60) : undefined,
      notes: notes ? notes.slice(0, 2000) : undefined,
    });
    sheetRows.push(r);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`More than ${MAX_IMPORT_ROWS} leads in the file. Split it into batches of ${MAX_IMPORT_ROWS}.`);
    }
  }
  if (!rows.length) throw new BadRequestException("The file has no leads under the header row.");
  return { rows, sheetRows };
}

/** The blank sheet staff fill in: headers, drop-downs for loan type and lead source, and a "how to fill" page. */
export async function buildLeadTemplate(loanTypes: string[], sources: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Growth Capital Services";
  const sheet = workbook.addWorksheet("Leads");
  const lists = workbook.addWorksheet("Lists");
  const help = workbook.addWorksheet("How to fill");

  const columns = [
    { header: "Name", width: 28, required: true },
    { header: "Phone", width: 16, required: true },
    { header: "Email", width: 28 },
    { header: "City", width: 18 },
    { header: "Loan type", width: 28 },
    { header: "Loan amount", width: 16 },
    { header: "Lead source", width: 24 },
    { header: "Notes", width: 40 },
  ];
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.header, width: c.width }));
  const head = sheet.getRow(1);
  head.height = 22;
  head.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: columns[col - 1].required ? "FFB8860B" : "FF0B1F4B" } };
    cell.alignment = { vertical: "middle" };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getColumn(2).numFmt = "@"; // keep phone numbers as text so nothing is rounded or reformatted
  sheet.getColumn(6).numFmt = "#,##0";

  lists.getCell("A1").value = "Loan types";
  lists.getCell("B1").value = "Lead sources";
  lists.getRow(1).font = { bold: true };
  loanTypes.forEach((n, i) => (lists.getCell(i + 2, 1).value = n));
  sources.forEach((n, i) => (lists.getCell(i + 2, 2).value = n));
  lists.getColumn(1).width = 32;
  lists.getColumn(2).width = 32;

  for (let r = 2; r <= MAX_IMPORT_ROWS + 1; r++) {
    if (loanTypes.length) {
      sheet.getCell(r, 5).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$A$2:$A$${loanTypes.length + 1}`], showErrorMessage: true, errorTitle: "Loan type", error: "Pick a loan type from the list." };
    }
    if (sources.length) {
      // A new source can be typed; the list is a convenience, not a rule.
      sheet.getCell(r, 7).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$B$2:$B$${sources.length + 1}`], showErrorMessage: false };
    }
  }

  help.getColumn(1).width = 110;
  [
    "How to fill this sheet",
    "",
    "1. Type one lead per row on the Leads sheet, starting at row 2. Leave the header row as it is.",
    "2. Name and Phone (gold headings) are required. Everything else is optional.",
    "3. Phone: a 10-digit Indian mobile number. +91 or a leading 0 is fine. Numbers already in the CRM are skipped.",
    "4. Loan type and Lead source have drop-downs. A lead source you type that is not in the list is kept as typed.",
    "5. Loan amount: numbers only, in rupees, for example 4500000.",
    `6. Up to ${MAX_IMPORT_ROWS} leads per file. Save as Excel (.xlsx) or CSV, then upload it on the Leads page.`,
    "",
    "Example row: Asha Patil | 9876500001 | asha@example.com | Pune | Home Loan | 4500000 | Walk-in | Referred by an existing client",
  ].forEach((line, i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = line;
    cell.alignment = { wrapText: true, vertical: "top" };
    if (i === 0) cell.font = { bold: true, size: 14 };
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
