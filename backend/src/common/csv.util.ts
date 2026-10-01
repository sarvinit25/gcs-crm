/**
 * Spreadsheet programs run a cell that starts with = + - @ (or a tab/CR) as a
 * formula. Free text from the public enquiry form ends up in exports, so a
 * visitor could plant `=HYPERLINK(...)` in a name. A leading apostrophe makes
 * Excel and Sheets show it as plain text. Real numbers and phone numbers
 * (e.g. -5000, +919876543210) are left untouched.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+([.,]\d+)*$/;

export function neutraliseFormula(text: string) {
  return FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
}

/** Escapes a value for CSV — formulas defused, quotes doubled, field wrapped when it needs it. */
export function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const text = typeof value === "number" ? raw : neutraliseFormula(raw);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(",")),
  ].join("\n");
}
