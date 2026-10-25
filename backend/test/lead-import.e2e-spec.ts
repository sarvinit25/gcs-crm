import { INestApplication } from "@nestjs/common";
import ExcelJS from "exceljs";
import request from "supertest";
import { createTestApp } from "./app";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

async function sheet(rows: (string | number | null)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.addRow(["Name", "Phone", "Email", "City", "Loan type", "Loan amount", "Lead source", "Notes"]);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("lead import from Excel", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("serves the template as an Excel file listing this CRM's loan types and lead sources", async () => {
    const res = await http.get(`${API}/leads/import-template`).set(as(admin)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ExcelJS.Buffer);
    const loanTypes = wb.getWorksheet("Lists")!.getColumn(1).values as unknown[];
    const sources = wb.getWorksheet("Lists")!.getColumn(2).values as unknown[];
    expect(loanTypes).toContain("Home Loan");
    expect(sources).toContain("Walk-in");
  });

  it("imports an uploaded file, keeping the lead source, and reports problems against the file's own rows", async () => {
    const file = await sheet([
      ["Import One", 9811700001, "one@example.com", "Pune", "Home Loan", 2500000, "Walk-in", "First"],
      ["Import Bad Phone", "12345", null, null, null, null, null, null],
      ["Import Two", 9811700002, null, null, "Not A Loan", null, null, null],
      ["Import One Again", 9811700001, null, null, null, null, null, null],
    ]);
    const res = await http.post(`${API}/leads/import`).set(as(admin)).attach("file", file, "leads.xlsx");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 1, duplicates: 1, invalid: 2 });
    // The header is row 1, so the second lead is on row 3, the third on row 4, the fourth on row 5.
    const byName = Object.fromEntries((res.body.results as { name: string; row: number }[]).map((r) => [r.name, r.row + 1]));
    expect(byName).toMatchObject({ "Import Bad Phone": 3, "Import Two": 4, "Import One Again": 5 });

    const lead = ((await http.get(`${API}/leads?search=Import%20One`).set(as(admin))).body.items as { name: string; channel: string; source: string; loanProduct: { name: string } }[]).find((l) => l.name === "Import One")!;
    expect(lead).toMatchObject({ channel: "Walk-in", source: "bulk-upload" });
    expect(lead.loanProduct.name).toBe("Home Loan");
  });

  it("imports a CSV too, and turns away a missing or unreadable file", async () => {
    const csv = Buffer.from("Name,Phone\nCsv Import,9811700003\n");
    const ok = await http.post(`${API}/leads/import`).set(as(admin)).attach("file", csv, "leads.csv");
    expect(ok.body.created).toBe(1);
    expect((await http.post(`${API}/leads/import`).set(as(admin))).status).toBe(400);
    expect((await http.post(`${API}/leads/import`).set(as(admin)).attach("file", Buffer.from("junk"), "x.xlsx")).status).toBe(400);
  });
});
