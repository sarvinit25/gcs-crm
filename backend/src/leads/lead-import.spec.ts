import ExcelJS from "exceljs";
import { buildLeadTemplate, MAX_IMPORT_ROWS, parseLeadFile } from "./lead-import";

async function workbookWith(rows: (string | number | null)[][], header = ["Name", "Phone", "Email", "City", "Loan type", "Loan amount", "Lead source", "Notes"]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.addRow(header);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("lead import file", () => {
  it("reads every column from an Excel file, including phone and amount typed as numbers", async () => {
    const file = await workbookWith([["Asha Patil", 9876500001, "asha@example.com", "Pune", "Home Loan", 4500000, "Walk-in", "Referred"]]);
    const { rows, sheetRows } = await parseLeadFile(file, "leads.xlsx");
    expect(rows).toEqual([{ name: "Asha Patil", phone: "9876500001", email: "asha@example.com", city: "Pune", product: "Home Loan", amount: 4500000, channel: "Walk-in", notes: "Referred" }]);
    expect(sheetRows).toEqual([2]);
  });

  it("reads a CSV, strips ₹ and commas from the amount, and understands other names for the columns", async () => {
    const csv = 'Contact Person Name,Mobile,Loan Amount,Source\n"Patil, Asha",9876500002,"₹45,00,000",Referral\n';
    const { rows } = await parseLeadFile(Buffer.from(csv), "leads.csv");
    expect(rows[0]).toMatchObject({ name: "Patil, Asha", phone: "9876500002", amount: 4500000, channel: "Referral" });
  });

  it("skips blank lines but keeps each lead's own row number", async () => {
    const file = await workbookWith([["A One", 9876500003], [null, null], ["B Two", 9876500004]]);
    const { rows, sheetRows } = await parseLeadFile(file, "leads.xlsx");
    expect(rows.map((r) => r.name)).toEqual(["A One", "B Two"]);
    expect(sheetRows).toEqual([2, 4]);
  });

  it("refuses a file with no name or phone column, no leads, too many leads, or that is not a spreadsheet", async () => {
    await expect(parseLeadFile(await workbookWith([["x"]], ["Email"]), "a.xlsx")).rejects.toThrow(/"Name" and "Phone"/);
    await expect(parseLeadFile(await workbookWith([]), "a.xlsx")).rejects.toThrow(/no leads/);
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`Person ${i}`, 9800000000 + i]);
    await expect(parseLeadFile(await workbookWith(many), "a.xlsx")).rejects.toThrow(/Split it/);
    await expect(parseLeadFile(Buffer.from("not a spreadsheet"), "a.xlsx")).rejects.toThrow(/could not be read/);
  });

  it("builds a template that has the headings, the lists, and no example row to import by mistake", async () => {
    const buffer = await buildLeadTemplate(["Home Loan", "Personal Loan"], ["Walk-in", "Referral"]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Leads", "Lists", "How to fill"]);
    expect(wb.getWorksheet("Leads")!.getRow(1).values).toEqual([undefined, "Name", "Phone", "Email", "City", "Loan type", "Loan amount", "Lead source", "Notes"]);
    expect(wb.getWorksheet("Lists")!.getCell("A3").value).toBe("Personal Loan");
    expect(wb.getWorksheet("Leads")!.getCell("E2").dataValidation?.type).toBe("list");
    // Filled in, it reads back as the person typed it.
    wb.getWorksheet("Leads")!.addRow(["Filled In", "9876500009"]);
    const filled = Buffer.from(await wb.xlsx.writeBuffer());
    expect((await parseLeadFile(filled, "t.xlsx")).rows).toEqual([expect.objectContaining({ name: "Filled In", phone: "9876500009" })]);
    await expect(parseLeadFile(buffer, "t.xlsx")).rejects.toThrow(/no leads/);
  });
});
