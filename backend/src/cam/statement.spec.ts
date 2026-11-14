import ExcelJS from "exceljs";
import { analyseTxns } from "./statement-analyse";
import { csvRows, fromPdfText, fromRows, parseDate, parseMoney, settle } from "./statement-parse";
import { readStatement } from "./statement-read";

// A made-up statement: salary on the 1st, an EMI on the 3rd, shopping on the 8th, cash on the 20th, six months of 2026.
// March also has a returned EMI charge. Every figure below can be checked by hand.
type Row = { date: Date; text: string; debit: number; credit: number; balance: number };

function statement(): Row[] {
  const rows: Row[] = [];
  let bal = 50_000;
  const add = (y: number, m: number, d: number, text: string, debit: number, credit: number) => {
    bal += credit - debit;
    rows.push({ date: new Date(Date.UTC(y, m - 1, d)), text, debit, credit, balance: bal });
  };
  for (let m = 1; m <= 6; m++) {
    add(2026, m, 1, `NEFT CR-ACME LTD SALARY ${m}`, 0, 60_000);
    add(2026, m, 3, `ACH D- BAJAJ FINANCE LTD EMI ${100000 + m}`, 12_000, 0);
    if (m === 3) add(2026, m, 4, "ECS RETURN CHARGES INSUFFICIENT FUNDS", 590, 0);
    add(2026, m, 8, `UPI/${600000000000 + m}/GROCERIES`, 5_000, 0);
    add(2026, m, 20, "ATM WDL", 20_000, 0);
  }
  return rows;
}

const dmy = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const csvOf = (rows: Row[]) =>
  ["Statement of account", "", "Txn Date,Value Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance", ...rows.map((r) => `${dmy(r.date)},${dmy(r.date)},"${r.text}",${r.debit || ""},${r.credit || ""},${r.balance}`)].join("\n");

describe("small readers", () => {
  it("reads Indian dates and amounts", () => {
    expect(parseDate("05/09/2026")!.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(parseDate("5-Sep-26")!.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(parseDate("05 September 2026")!.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(parseDate("2026-09-05")!.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("Balance")).toBeNull();
    expect(parseMoney("1,23,456.78")).toBe(123456.78);
    expect(parseMoney("(500.00)")).toBe(-500);
    expect(parseMoney("12,000.00 Cr")).toBe(12000);
    expect(parseMoney("12,000.00 Dr")).toBe(-12000);
    expect(parseMoney("-")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
  it("reads quoted CSV cells", () => {
    expect(csvRows('a,"b, c",d\n1,"say ""hi""",3')).toEqual([["a", "b, c", "d"], ["1", 'say "hi"', "3"]]);
  });
});

describe("a CSV statement", () => {
  const txns = settle(fromRows(csvRows(csvOf(statement()))));
  it("finds every transaction under the right heading", () => {
    expect(txns).toHaveLength(statement().length);
    expect(txns[0]).toMatchObject({ credit: 60_000, debit: 0, balance: 110_000 });
  });
  const a = analyseTxns(txns);
  it("reports six months, newest first", () => {
    expect(a.monthsFound).toBe(6);
    expect(a.months.map((m) => m.label)).toEqual(["Jun 2026", "May 2026", "Apr 2026", "Mar 2026", "Feb 2026", "Jan 2026"]);
    expect(a.openingBalance).toBe(50_000);
  });
  it("works January out by hand", () => {
    const jan = a.months[5]!;
    expect(jan).toMatchObject({ creditCount: 1, debitCount: 3, credits: 60_000, debits: 37_000, salary: 60_000, emisSeen: 12_000, minBalance: 73_000 });
    expect([jan.bal5, jan.bal10, jan.bal15, jan.bal25]).toEqual([98_000, 93_000, 93_000, 73_000]);
    expect(jan.avgBalance).toBe(89_250);
    expect(jan.partial).toBe(false);
  });
  it("carries a balance into the next month", () => {
    // February starts from January's closing 73,000; the 1st adds the salary and the 3rd takes the EMI
    const feb = a.months[4]!;
    expect(feb.bal5).toBe(73_000 + 60_000 - 12_000);
  });
  it("finds the EMI, the salary and the returned payment", () => {
    expect(a.emis[0]).toMatchObject({ amount: 12_000, times: 6, total: 72_000 });
    expect(a.emis[0]!.label).toMatch(/BAJAJ/);
    expect(a.salary).toMatchObject({ times: 6, total: 360_000, averagePerMonth: 60_000 });
    expect(a.months[3]!.inward).toBe(1); // March
    expect(a.returns.inward).toBe(1);
    expect(a.months[3]!.emisSeen).toBe(12_000); // the return charge is not counted as an EMI
  });
  it("turns a newest-first statement round", () => {
    const reversed = csvOf([...statement()].reverse());
    const b = analyseTxns(settle(fromRows(csvRows(reversed))));
    expect(b.months[5]!.avgBalance).toBe(89_250);
  });
});

describe("a statement with one amount column and the balance deciding the direction", () => {
  it("reads a PDF's lines", () => {
    const lines = statement().map((r) => `${dmy(r.date)} ${r.text} ${money(r.debit || r.credit)} ${money(r.balance)}`);
    lines.splice(2, 0, "continued narration line"); // a wrapped narration joins the line above (the EMI)
    const txns = settle(fromPdfText(["HDFC BANK Statement of Account", "Page 1 of 3", "Date Narration Amount Balance", ...lines, "Page 2 of 3"].join("\n")));
    expect(txns).toHaveLength(statement().length);
    expect(txns[0]).toMatchObject({ credit: 60_000, balance: 110_000 });
    expect(txns[1]).toMatchObject({ debit: 12_000 });
    expect(txns[1]!.text).toContain("continued narration");
    const a = analyseTxns(txns);
    expect(a.months[5]!.avgBalance).toBe(89_250);
    expect(a.salary.times).toBe(6);
  });
  it("reads a sheet with an amount column and a Dr/Cr column", () => {
    const rows = [["Date", "Description", "Amount", "Dr/Cr", "Balance"], ...statement().map((r) => [r.date, r.text, r.debit || r.credit, r.debit ? "DR" : "CR", r.balance])];
    const txns = settle(fromRows(rows));
    expect(txns[0]).toMatchObject({ credit: 60_000 });
    expect(txns[1]).toMatchObject({ debit: 12_000 });
  });
});

describe("reading an uploaded file", () => {
  it("reads a CSV upload end to end and gives the CAM tables", async () => {
    const { analysis, fill, kind } = await readStatement(Buffer.from(csvOf(statement())), "march.csv");
    expect(kind).toBe("CSV");
    expect(fill.bankingDetail.detail).toHaveLength(6);
    expect(fill.bankingDetail.detail[0]).toMatchObject({ month: "Jun 2026", creditCount: 1, salary: 60_000, emisSeen: 12_000 });
    expect(fill.banking.months[5]).toMatchObject({ month: "Jan 2026", credits: 60_000, debits: 37_000, avgBalance: 89_250, minBalance: 73_000, returns: 0 });
    expect(fill.banking.months[3]).toMatchObject({ month: "Mar 2026", returns: 1 });
    expect(analysis.warnings.join(" ")).toMatch(/Check the lists/);
  });

  it("reads an Excel upload with the table below some heading rows and real date cells", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Statement");
    ws.addRow(["ACME Bank", "", "", "", ""]);
    ws.addRow(["Account holder: Test Person"]);
    ws.addRow([]);
    ws.addRow(["Date", "Narration", "Debit", "Credit", "Balance"]);
    for (const r of statement()) ws.addRow([r.date, r.text, r.debit || null, r.credit || null, r.balance]);
    ws.addRow(["Total", "", 1, 2, 3]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const { analysis, kind } = await readStatement(buf, "stmt.xlsx");
    expect(kind).toBe("Excel");
    expect(analysis.months[5]!.avgBalance).toBe(89_250);
    expect(analysis.transactions).toBe(statement().length);
  });

  it("reads a text PDF upload", async () => {
    // a one-page PDF built by hand: every row's date, narration, amount and balance placed as separate pieces of text
    const rows = statement().slice(0, 12);
    const pieces: string[] = ["BT /F1 9 Tf 40 800 Td (ACME BANK STATEMENT OF ACCOUNT) Tj ET", "BT /F1 9 Tf 40 785 Td (Date Narration Amount Balance) Tj ET"];
    rows.forEach((r, i) => {
      const y = 760 - i * 14;
      pieces.push(`BT /F1 9 Tf 40 ${y} Td (${dmy(r.date)}) Tj ET`, `BT /F1 9 Tf 110 ${y} Td (${r.text.replace(/[()]/g, "")}) Tj ET`, `BT /F1 9 Tf 380 ${y} Td (${money(r.debit || r.credit)}) Tj ET`, `BT /F1 9 Tf 460 ${y} Td (${money(r.balance)}) Tj ET`);
    });
    // pad the page with text so it is clearly not a scan
    pieces.push("BT /F1 9 Tf 40 40 Td (This statement is computer generated and needs no signature. Please report any difference within thirty days of receipt.) Tj ET");
    const stream = pieces.join("\n");
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const { analysis, kind } = await readStatement(Buffer.from(pdf, "latin1"), "stmt.pdf");
    expect(kind).toBe("PDF");
    expect(analysis.transactions).toBe(12);
    // twelve rows reach into March: Jan (4 rows), Feb (4 rows) and the first 4 of March
    expect(analysis.months.map((m) => m.label)).toEqual(["Mar 2026", "Feb 2026", "Jan 2026"]);
    expect(analysis.salary.times).toBe(3);
    expect(analysis.months[2]!.avgBalance).toBe(89_250);
  });

  it("explains what to do for a scan, an old .xls, a locked file and rubbish", async () => {
    const scanPdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
    await expect(readStatement(Buffer.from(scanPdf, "latin1"), "scan.pdf")).rejects.toThrow(/scan|could not be read/i);
    const xls = Buffer.alloc(600);
    xls.writeUInt32LE(0xe011cfd0, 0);
    await expect(readStatement(xls, "old.xls")).rejects.toThrow(/\.xlsx or CSV/);
    await expect(readStatement(Buffer.from("name,age\nA,3\nB,4\nC,5"), "x.csv")).rejects.toThrow(/transaction table/);
    await expect(readStatement(Buffer.alloc(16 * 1024 * 1024), "big.csv")).rejects.toThrow(/too big/);
  });
});

// How the large Indian banks head their statements (from what their own downloads look like): the reader should find the
// transaction table under any of them.
describe("the headings banks use", () => {
  const sample = statement().slice(0, 8);
  const sheet = (head: string[], cell: (r: Row) => (string | number | Date)[]) => [["Account statement"], [], head, ...sample.map(cell)];
  const check = (rows: unknown[][]) => {
    const t = settle(fromRows(rows));
    expect(t).toHaveLength(8);
    expect(t[0]).toMatchObject({ credit: 60_000, balance: 110_000 });
    expect(t[1]).toMatchObject({ debit: 12_000 });
  };
  it("HDFC", () => check(sheet(["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"], (r) => [dmy(r.date), r.text, "0000", dmy(r.date), r.debit || "", r.credit || "", r.balance])));
  it("ICICI", () => check(sheet(["S No.", "Value Date", "Transaction Date", "Cheque Number", "Transaction Remarks", "Withdrawal Amount (INR)", "Deposit Amount (INR)", "Balance (INR)"], (r) => [1, dmy(r.date), dmy(r.date), "", r.text, r.debit || "", r.credit || "", r.balance])));
  it("SBI", () => check(sheet(["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"], (r) => [dmy(r.date), dmy(r.date), r.text, "", r.debit || "", r.credit || "", r.balance])));
  it("Axis", () => check(sheet(["SRL NO", "TRAN DATE", "CHQNO", "PARTICULARS", "DR", "CR", "BAL", "SOL"], (r) => [1, dmy(r.date), "", r.text, r.debit || "", r.credit || "", r.balance, 12])));
  it("Kotak, one column for both amounts with (Dr) and (Cr)", () => check(sheet(["Date", "Narration", "Chq/Ref No", "Withdrawal (Dr)/ Deposit (Cr)", "Balance"], (r) => [dmy(r.date), r.text, "", `${money(r.debit || r.credit)}(${r.debit ? "Dr" : "Cr"})`, `${money(r.balance)}(Cr)`])));
  it("IDFC First, Yes Bank and Bandhan style", () => {
    check(sheet(["Transaction Date", "Value Date", "Particulars", "Cheque No.", "Debit", "Credit", "Balance"], (r) => [dmy(r.date), dmy(r.date), r.text, "", r.debit || "", r.credit || "", r.balance]));
    check(sheet(["Transaction Date", "Value Date", "Description", "Debit", "Credit", "Running Balance"], (r) => [dmy(r.date), dmy(r.date), r.text, r.debit || "", r.credit || "", r.balance]));
  });
  it("PDF rows with a reference number, a value date, Indian digit grouping and a two-digit year", () => {
    const hdfc = sample.map((r) => `${dmy(r.date).replace(/\/20/, "/")} ${r.text} 0000${Math.round(r.balance)} ${dmy(r.date).replace(/\/20/, "/")} ${r.debit ? money(r.debit) : ""} ${r.credit ? money(r.credit) : ""} ${money(r.balance)}`.replace(/\s+/g, " "));
    const t = settle(fromPdfText(hdfc.join("\n")));
    expect(t).toHaveLength(8);
    expect(t[0]).toMatchObject({ credit: 60_000, balance: 110_000 });
    expect(t[1]).toMatchObject({ debit: 12_000 });
    const sbi = sample.map((r) => { const d = `${r.date.getUTCDate()} Jan ${r.date.getUTCFullYear()}`; return `${d} ${d} ${r.text} ${money(r.debit || r.credit)} ${money(r.balance)}`; });
    const u = settle(fromPdfText(sbi.join("\n")));
    expect(u).toHaveLength(8);
    expect(u[0]).toMatchObject({ credit: 60_000 });
  });
});
