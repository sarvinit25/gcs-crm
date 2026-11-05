/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import ExcelJS from "exceljs";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { istToday } from "../src/common/date.util";
import { PrismaService } from "../src/prisma/prisma.service";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };
const MANAGER = { email: "rpt.manager.e2e@example.com", password: "ManagerPass#12345", phone: "9000088801" };
const STAFF = { email: "rpt.staff.e2e@example.com", password: "StaffPass#12345", phone: "9000088802" };
const OTHER = { email: "rpt.other.e2e@example.com", password: "StaffPass#12345", phone: "9000088803" };

const KINDS = ["leads", "callbacks", "files", "login-files", "sanctions", "disbursals", "rejects", "commissions"];

/**
 * The Reports hub, the eight detailed reports, saved export templates and the custom Excel export.
 * The e2e database is shared between spec files, so everything here is found through things only this file
 * creates (its own lender, lead sources and partner) rather than through global counts.
 */
describe("reports hub, detailed reports and custom exports", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let manager: string;
  let staff: string;
  let other: string;
  let lenderId: string;
  let partnerId: string;
  let staffId: string;
  let fileA: string;
  const today = istToday();
  const SOURCE_A = "RPT Source Alpha";
  const SOURCE_B = "RPT Source Beta";

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token: string) => http.get(`${API}${path}`).set(as(token));
  const post = (path: string, token: string | undefined, body: object = {}) =>
    http.post(`${API}${path}`).set(token ? as(token) : {}).send(body);
  const put = (path: string, token: string, body: object) => http.put(`${API}${path}`).set(as(token)).send(body);
  const patch = (path: string, token: string, body: object) => http.patch(`${API}${path}`).set(as(token)).send(body);
  const del = (path: string, token: string) => http.delete(`${API}${path}`).set(as(token));

  /** Downloads an export and returns its table: the header labels and the rows under them. */
  const sheet = async (path: string, token: string) => {
    const res = await http
      .get(`${API}${path}`)
      .set(as(token))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    if (res.status !== 200) return { status: res.status, header: [] as string[], rows: [] as any[][] };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as never);
    const ws = wb.worksheets[0];
    let headerRow = 0;
    // The table starts at the row whose fill is navy and whose first cell is a column label — the one after "SUMMARY".
    let sawSummary = false;
    ws.eachRow((row, n) => {
      if (row.getCell(1).value === "SUMMARY") sawSummary = true;
      if (sawSummary && !headerRow && row.getCell(1).fill && (row.getCell(1).fill as any).fgColor?.argb === "FF0B1849" && row.getCell(1).value !== "SUMMARY") {
        headerRow = n;
      }
    });
    const header: string[] = [];
    ws.getRow(headerRow).eachCell((c) => header.push(String(c.value)));
    const rows: any[][] = [];
    for (let n = headerRow + 1; n <= ws.rowCount; n++) {
      const row = ws.getRow(n);
      const first = row.getCell(1).value;
      if (first === "TOTAL" || first === "No records match these filters." || first === null || first === undefined) break;
      rows.push(header.map((_, i) => row.getCell(i + 1).value));
    }
    return { status: res.status, header, rows };
  };

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await post("/auth/login", undefined, ADMIN)).body.accessToken;

    const mk = async (u: { email: string; password: string; phone: string }, name: string, role: string) => {
      const made = await post("/team", admin, { name, email: u.email, phone: u.phone, role, password: u.password });
      return { id: made.body.id as string, token: await signIn(post, u.email, u.password) };
    };
    manager = (await mk(MANAGER, "Rpt Manager", "MANAGER")).token;
    const s = await mk(STAFF, "Rpt Staff", "ADVISOR");
    staff = s.token;
    staffId = s.id;
    const o = await mk(OTHER, "Rpt Other", "ADVISOR");
    other = o.token;

    lenderId = (await post("/lenders", admin, { name: "Rpt Test Bank", type: "BANK" })).body.id;
    partnerId = (await post("/partners", admin, { name: "Rpt Partner", phone: "9000088804", commissionRate: 20, password: "PartnerPass#1234" })).body.id;
    const products = (await get("/loan-products", admin)).body as { id: string; name: string }[];

    const lead = async (name: string, phone: string, channel: string, officerId: string, sourcingPartnerId?: string) =>
      (await post("/leads", admin, { name, phone, source: "e2e", channel, assignedOfficerId: officerId, sourcingPartnerId, amount: 2000000 })).body.id as string;
    const leadA = await lead("Rpt Alpha Customer", "9000088811", SOURCE_A, staffId, partnerId);
    const leadB = await lead("Rpt Beta Customer", "9000088812", SOURCE_B, staffId);
    const leadC = await lead("Rpt Gamma Customer", "9000088813", SOURCE_A, o.id);
    await post("/leads", staff, { name: "Rpt Follow-up Lead", phone: "9000088814", source: "e2e", channel: SOURCE_B });

    // File A: full journey — bank login, sanction, disbursal, commission, with a co-applicant.
    const a = await post("/applications", admin, {
      leadId: leadA,
      loanProductId: products[0].id,
      requestedAmount: 2000000,
      tenureMonths: 120,
      lenderId,
      ownerId: staffId,
      purpose: "Purchase of flat",
      applicants: [
        { name: "Rpt Alpha Customer", phone: "9000088811", isPrimary: true, pan: "ABCDE1234F", employmentType: "SALARIED", employerName: "Acme Ltd", monthlyIncome: 90000 },
        { name: "Rpt Alpha Spouse", phone: "9000088821", relation: "Spouse", pan: "FGHIJ5678K", monthlyIncome: 40000 },
      ],
    });
    fileA = a.body.id;
    await patch(`/applications/${fileA}`, admin, { bankLoginAt: today, bankReferenceNo: "RPT-REF-1", bankerName: "Banker Bhatt", status: "BANK_LOGIN" });
    await put(`/applications/${fileA}/sanction`, admin, {
      technicalStatus: "APPROVED",
      financialStatus: "APPROVED",
      legalStatus: "APPROVED",
      sanctionedAmount: 1800000,
      interestRate: 9.5,
      tenureMonths: 120,
      sanctionDate: today,
      bankRm: "Rpt RM",
      commissionPercent: 0.5,
    });
    const payout = await post(`/applications/${fileA}/disbursements`, admin, {
      amount: 1000000,
      disbursedAt: today,
      mode: "RTGS",
      utrNo: "RPTUTR001",
      loanAccountNo: "RPTLAN001",
      processingFee: 10000,
    });
    await post(`/disbursements/${payout.body.id}/commission`, admin, { grossAmount: 9000 });

    // File B: turned down after the bank login.
    const b = await post("/applications", admin, {
      leadId: leadB,
      loanProductId: products[1].id,
      requestedAmount: 500000,
      lenderId,
      ownerId: staffId,
      applicants: [{ name: "Rpt Beta Customer", phone: "9000088812", isPrimary: true }],
    });
    await patch(`/applications/${b.body.id}`, admin, { bankLoginAt: today, status: "REJECTED" });

    // File C: somebody else's.
    await post("/applications", admin, {
      leadId: leadC,
      loanProductId: products[0].id,
      requestedAmount: 700000,
      ownerId: o.id,
      applicants: [{ name: "Rpt Gamma Customer", phone: "9000088813", isPrimary: true }],
    });

    // A follow-up that was due yesterday-ish and a done one.
    await post(`/leads/${leadA}/follow-ups`, admin, { note: "Call back", dueAt: today });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("hub", () => {
    it("gives Admin the headline numbers, trends, pipeline, lenders and commission", async () => {
      const res = await get("/reports/hub", admin);
      expect(res.status).toBe(200);
      const { kpis, trends, pipeline, lenders, commission, reports } = res.body;
      expect(kpis.leads.total).toBeGreaterThanOrEqual(4);
      expect(kpis.leads.thisMonth).toBeGreaterThanOrEqual(4);
      expect(kpis.activeFiles.total).toBeGreaterThanOrEqual(1);
      expect(kpis.sanctioned.amount).toBeGreaterThanOrEqual(1800000);
      expect(kpis.disbursed.amount).toBeGreaterThanOrEqual(1000000);
      expect(kpis.disbursed.thisMonthAmount).toBeGreaterThanOrEqual(1000000);
      expect(kpis.commission.total).toBeGreaterThanOrEqual(9000);
      expect(kpis.commission.pending).toBeGreaterThanOrEqual(9000);
      expect(trends).toHaveLength(6);
      expect(trends[5].month).toBe(today.slice(0, 7));
      expect(trends[5]).toEqual(expect.objectContaining({ leads: expect.any(Number), files: expect.any(Number), sanctions: expect.any(Number), disbursals: expect.any(Number) }));
      expect(pipeline.stages.map((s: any) => s.key)).toEqual(["DRAFT", "SUBMITTED", "BANK_LOGIN", "UNDER_REVIEW", "SANCTIONED", "DISBURSED", "REJECTED", "WITHDRAWN"]);
      expect(pipeline.total).toBe(pipeline.stages.reduce((n: number, s: any) => n + s.count, 0));
      expect(lenders.find((l: any) => l.lender === "Rpt Test Bank").sanctionedAmount).toBe(1800000);
      expect(commission.due + commission.claimed + commission.received).toBeCloseTo(commission.total, 2);
      expect(reports.map((r: any) => r.kind)).toEqual(KINDS);
    });

    it("narrows to a date range", async () => {
      const res = await get("/reports/hub?from=2000-01-01&to=2000-01-31", admin);
      expect(res.body.kpis.leads.total).toBe(0);
      expect(res.body.kpis.sanctioned.count).toBe(0);
      expect(res.body.kpis.disbursed.amount).toBe(0);
      expect(res.body.pipeline.total).toBe(0);
      expect(res.body.lenders).toEqual([]);
      expect(res.body.commission.total).toBe(0);
      expect(res.body.trends).toHaveLength(6);
      const todayOnly = await get(`/reports/hub?from=${today}&to=${today}`, admin);
      expect(todayOnly.body.kpis.leads.total).toBeGreaterThanOrEqual(4);
    });

    it("shows Staff only their own business and no commission at all", async () => {
      const res = await get("/reports/hub", staff);
      expect(res.status).toBe(200);
      expect(res.body.kpis.leads.total).toBe(3);
      expect(res.body.kpis.activeFiles.total).toBe(1);
      expect(res.body.kpis.sanctioned.count).toBe(1);
      expect(res.body.kpis.commission).toBeNull();
      expect(res.body.commission).toBeNull();
      expect(JSON.stringify(res.body)).not.toMatch(/commission":\{/);
      expect(res.body.reports.map((r: any) => r.kind)).toEqual(KINDS.filter((k) => k !== "commissions"));
      expect(res.body.lenders.map((l: any) => l.lender)).toEqual(["Rpt Test Bank"]);

      const theirs = await get("/reports/hub", other);
      expect(theirs.body.kpis.leads.total).toBe(1);
      expect(theirs.body.kpis.sanctioned.count).toBe(0);
    });

    it("gives Manager the commission figures too", async () => {
      expect((await get("/reports/hub", manager)).body.kpis.commission.total).toBeGreaterThanOrEqual(9000);
    });

    describe("funnel, loan types and why enquiries are lost", () => {
      const REASON = "RPT price was too high";

      beforeAll(async () => {
        const lead = await post("/leads", admin, { name: "Rpt Lost Lead", phone: "9000033301", source: SOURCE_A, assignedOfficerId: staffId });
        const closed = await patch(`/leads/${lead.body.id}`, admin, { status: "LOST", lostReason: REASON });
        expect(closed.status).toBe(200);
      });

      it("shows the journey from enquiry to payout, each step against the one before", async () => {
        const { funnel } = (await get("/reports/hub", admin)).body;
        expect(funnel.map((f: any) => f.key)).toEqual(["leads", "files", "logged-in", "sanctioned", "disbursed"]);
        expect(funnel[0].ofPrevious).toBeNull();
        expect(funnel[0].ofFirst).toBe(100);
        for (const step of funnel.slice(1)) {
          expect(step.ofPrevious === null || (step.ofPrevious >= 0 && step.ofPrevious <= 100)).toBe(true);
          expect(step.ofFirst === null || step.ofFirst <= 100).toBe(true);
        }
        expect(funnel[3].count).toBeGreaterThanOrEqual(1);
        expect(funnel[4].count).toBeGreaterThanOrEqual(1);
      });

      it("splits files by loan type, biggest first, with the amounts asked for", async () => {
        const { loanTypes, pipeline } = (await get("/reports/hub", admin)).body;
        expect(loanTypes.length).toBeGreaterThan(0);
        expect(loanTypes.length).toBeLessThanOrEqual(8);
        expect(loanTypes.reduce((n: number, t: any) => n + t.count, 0)).toBe(pipeline.total);
        // Biggest first (the folded-together "other" row, if any, closes the list).
        const counts = loanTypes.filter((t: any) => t.name !== "Other loan types").map((t: any) => t.count);
        expect(counts).toEqual([...counts].sort((x: number, y: number) => y - x));
        expect(loanTypes.every((t: any) => typeof t.name === "string" && t.amount >= 0)).toBe(true);
      });

      it("lists the reasons recorded when leads were lost, and keeps Staff to their own", async () => {
        const mine = (await get("/reports/hub", staff)).body.lostReasons;
        expect(mine.find((r: any) => r.reason === REASON).count).toBe(1);
        expect((await get("/reports/hub", other)).body.lostReasons.find((r: any) => r.reason === REASON)).toBeUndefined();
        expect((await get("/reports/hub", admin)).body.lostReasons.find((r: any) => r.reason === REASON).count).toBe(1);
      });

      it("follows the date range", async () => {
        const res = await get("/reports/hub?from=2000-01-01&to=2000-01-31", admin);
        expect(res.body.funnel.every((f: any) => f.count === 0)).toBe(true);
        expect(res.body.funnel.slice(1).every((f: any) => f.ofPrevious === null && f.ofFirst === null)).toBe(true);
        expect(res.body.loanTypes).toEqual([]);
        expect(res.body.lostReasons).toEqual([]);
      });
    });
  });

  describe("detailed reports", () => {
    it.each(KINDS)("%s has tiles, stages, a monthly trend and a loan-type split", async (kind) => {
      const res = await get(`/reports/detail/${kind}`, admin);
      expect(res.status).toBe(200);
      expect(res.body.kind).toBe(kind);
      expect(res.body.tiles.length).toBeGreaterThanOrEqual(3);
      expect(res.body.tiles.length).toBeLessThanOrEqual(4);
      expect(res.body.stages.length).toBeGreaterThan(0);
      expect(res.body.trend.length).toBeGreaterThan(0);
      const stageTotal = res.body.stages.reduce((n: number, s: any) => n + s.count, 0);
      expect(stageTotal).toBe(res.body.total.count);
      const typeTotal = res.body.loanTypes.reduce((n: number, t: any) => n + t.count, 0);
      expect(typeTotal).toBe(res.body.total.count);
    });

    it("filters files by lender, lead source and sourcing partner", async () => {
      const byLender = await get(`/reports/detail/files?lenderId=${lenderId}`, admin);
      expect(byLender.body.total.count).toBe(2);
      expect(byLender.body.total.amount).toBe(2500000);
      expect(byLender.body.tiles.map((t: any) => [t.label, t.value])).toEqual([
        ["Total files", 2],
        ["Active", 1],
        ["This month", 2],
        ["Rejected", 1],
      ]);
      expect(byLender.body.trend.at(-1)).toMatchObject({ month: today.slice(0, 7), count: 2 });

      const bySource = await get(`/reports/detail/files?channel=${encodeURIComponent(SOURCE_A)}`, admin);
      expect(bySource.body.total.count).toBe(2);
      const byPartner = await get(`/reports/detail/files?partnerId=${partnerId}`, admin);
      expect(byPartner.body.total.count).toBe(1);
      const combined = await get(`/reports/detail/files?lenderId=${lenderId}&partnerId=${partnerId}&channel=${encodeURIComponent(SOURCE_A)}`, admin);
      expect(combined.body.total.count).toBe(1);
      const none = await get(`/reports/detail/files?lenderId=${lenderId}&channel=${encodeURIComponent(SOURCE_B)}&partnerId=${partnerId}`, admin);
      expect(none.body.total.count).toBe(0);
      expect(none.body.loanTypes).toEqual([]);
    });

    it("splits the loan types with counts, amounts and shares", async () => {
      const res = await get(`/reports/detail/files?lenderId=${lenderId}`, admin);
      expect(res.body.loanTypes).toHaveLength(2);
      expect(res.body.loanTypes.map((t: any) => t.percent)).toEqual([50, 50]);
      expect(res.body.loanTypes.reduce((n: number, t: any) => n + t.amount, 0)).toBe(2500000);
      expect(res.body.stageTitle).toBe("File pipeline");
    });

    it("reports login files, sanctions, disbursals and rejects from the same journey", async () => {
      const login = await get(`/reports/detail/login-files?lenderId=${lenderId}`, admin);
      expect(login.body.total.count).toBe(2);
      const sanctions = await get(`/reports/detail/sanctions?lenderId=${lenderId}`, admin);
      expect(sanctions.body.total).toEqual({ count: 1, amount: 1800000 });
      expect(sanctions.body.stages.find((s: any) => s.key === "APPROVED").count).toBe(1);
      const disb = await get(`/reports/detail/disbursals?lenderId=${lenderId}`, admin);
      expect(disb.body.total).toEqual({ count: 1, amount: 1000000 });
      expect(disb.body.stages.find((s: any) => s.key === "RTGS").count).toBe(1);
      const rej = await get(`/reports/detail/rejects?lenderId=${lenderId}`, admin);
      expect(rej.body.total.count).toBe(1);
      expect(rej.body.stages.find((s: any) => s.key === "AFTER_LOGIN").count).toBe(1);
      const comm = await get(`/reports/detail/commissions?lenderId=${lenderId}`, admin);
      expect(comm.body.total).toEqual({ count: 1, amount: 9000 });
      expect(comm.body.tiles.map((t: any) => [t.label, t.value])).toEqual([
        ["Gross commission", 9000],
        ["Due", 9000],
        ["Claimed", 0],
        ["Received", 0],
      ]);
    });

    it("counts callbacks by lead source", async () => {
      const res = await get(`/reports/detail/callbacks?channel=${encodeURIComponent(SOURCE_A)}`, admin);
      expect(res.body.total.count).toBe(1);
    });

    it("keeps Staff to their own files and away from commission", async () => {
      const mine = await get(`/reports/detail/files?channel=${encodeURIComponent(SOURCE_A)}`, staff);
      expect(mine.body.total.count).toBe(1);
      const theirs = await get(`/reports/detail/files?channel=${encodeURIComponent(SOURCE_A)}`, other);
      expect(theirs.body.total.count).toBe(1);
      expect((await get("/reports/detail/commissions", staff)).status).toBe(403);
      expect((await get("/reports/detail/commissions", manager)).status).toBe(200);
      for (const kind of KINDS.filter((k) => k !== "commissions")) expect((await get(`/reports/detail/${kind}`, staff)).status).toBe(200);
    });

    it("refuses a report that does not exist", async () => {
      expect((await get("/reports/detail/nonsense", admin)).status).toBe(404);
      expect((await get("/reports/hub", undefined as never)).status).toBe(401);
    });
  });

  describe("column catalogue", () => {
    it("is served to the UI with every section, and without commission for Staff", async () => {
      const adminCat = (await get("/reports/catalogue", admin)).body;
      expect(adminCat.applications.sections.map((s: any) => s.label)).toContain("Co-applicants and guarantors");
      expect(adminCat.applications.columns.map((c: any) => c.key)).toContain("commissionAmount");
      expect(adminCat.applications.standardColumns).toContain("applicationNo");
      expect(adminCat.commissions.columns.length).toBeGreaterThan(0);

      const staffCat = (await get("/reports/catalogue", staff)).body;
      expect(staffCat.applications.columns.map((c: any) => c.key)).not.toContain("commissionAmount");
      expect(staffCat.applications.sections.map((s: any) => s.id)).not.toContain("commission");
      expect(staffCat.commissions.columns).toEqual([]);
      expect(JSON.stringify(staffCat)).not.toContain("commissionAmount");
    });
  });

  describe("saved templates", () => {
    let mine: string;
    const cols = ["applicationNo", "customer", "lender", "amount"];

    it("are saved per user, listed per register, and replaced when the name is reused", async () => {
      const saved = await post("/reports/templates", staff, { type: "applications", name: "  My   daily sheet ", columns: cols });
      expect(saved.status).toBe(201);
      expect(saved.body).toMatchObject({ type: "applications", name: "My daily sheet", columns: cols });
      mine = saved.body.id;

      const again = await post("/reports/templates", staff, { type: "applications", name: "My daily sheet", columns: ["applicationNo", "status"] });
      expect(again.body.id).toBe(mine);
      expect(again.body.columns).toEqual(["applicationNo", "status"]);
      await post("/reports/templates", staff, { type: "leads", name: "Leads sheet", columns: ["leadNo", "customer"] });

      const list = (await get("/reports/templates?type=applications", staff)).body;
      expect(list).toHaveLength(1);
      expect(list[0].columns).toEqual(["applicationNo", "status"]);
      expect((await get("/reports/templates", staff)).body).toHaveLength(2);
      expect((await get("/reports/templates?type=bogus", staff)).status).toBe(400);
    });

    it("are invisible to everyone else — other staff, and even Admin", async () => {
      expect((await get("/reports/templates", other)).body).toEqual([]);
      expect((await get("/reports/templates", admin)).body.some((t: any) => t.id === mine)).toBe(false);
      expect((await get("/reports/templates", manager)).body).toEqual([]);
    });

    it("can't be used or deleted by another user", async () => {
      expect((await sheet(`/reports/records/export?type=applications&templateId=${mine}`, other)).status).toBe(404);
      expect((await sheet(`/reports/records/export?type=applications&templateId=${mine}`, admin)).status).toBe(404);
      expect((await del(`/reports/templates/${mine}`, other)).status).toBe(404);
      expect((await del(`/reports/templates/${mine}`, admin)).status).toBe(404);
      expect((await get("/reports/templates?type=applications", staff)).body).toHaveLength(1);
      // and a template for one register can't be used on another
      expect((await sheet(`/reports/records/export?type=leads&templateId=${mine}`, staff)).status).toBe(404);
    });

    it("refuse unknown columns, empty choices, and commission columns for Staff", async () => {
      expect((await post("/reports/templates", staff, { type: "applications", name: "Bad", columns: ["applicationNo", "nope"] })).status).toBe(400);
      expect((await post("/reports/templates", staff, { type: "applications", name: "Bad", columns: [] })).status).toBe(400);
      expect((await post("/reports/templates", staff, { type: "applications", name: " ", columns: ["applicationNo"] })).status).toBe(400);
      expect((await post("/reports/templates", staff, { type: "nonsense", name: "Bad", columns: ["applicationNo"] })).status).toBe(400);
      const sneaky = await post("/reports/templates", staff, { type: "applications", name: "Sneaky", columns: ["applicationNo", "commissionAmount"] });
      expect(sneaky.status).toBe(403);
      expect((await get("/reports/templates?type=applications", staff)).body.map((t: any) => t.name)).not.toContain("Sneaky");
      // Admin may save one
      expect((await post("/reports/templates", admin, { type: "applications", name: "With commission", columns: ["applicationNo", "commissionAmount"] })).status).toBe(201);
    });

    it("can be deleted by their owner", async () => {
      expect((await del(`/reports/templates/${mine}`, staff)).status).toBe(200);
      expect((await get("/reports/templates?type=applications", staff)).body).toEqual([]);
    });
  });

  describe("custom export", () => {
    const filter = () => `lenderId=${lenderId}`;

    it("contains exactly the columns picked, in the order picked, for the filtered records only", async () => {
      const out = await sheet(`/reports/records/export?type=applications&columns=lender,applicationNo,amount&${filter()}`, admin);
      expect(out.status).toBe(200);
      expect(out.header).toEqual(["Lender", "Application no.", "Requested amount"]);
      expect(out.rows).toHaveLength(2);
      expect(out.rows.map((r) => r[0])).toEqual(["Rpt Test Bank", "Rpt Test Bank"]);
      expect(out.rows.map((r) => r[2]).sort((x, y) => x - y)).toEqual([500000, 2000000]);
    });

    it("honours the list's filters (source, partner, status, search)", async () => {
      const q = async (query: string) => (await sheet(`/reports/records/export?type=applications&columns=customer&${query}`, admin)).rows.map((r) => r[0]);
      expect(await q(`channel=${encodeURIComponent(SOURCE_A)}&lenderId=${lenderId}`)).toEqual(["Rpt Alpha Customer"]);
      expect(await q(`partnerId=${partnerId}`)).toEqual(["Rpt Alpha Customer"]);
      expect(await q(`status=REJECTED&${filter()}`)).toEqual(["Rpt Beta Customer"]);
      expect(await q(`q=Gamma`)).toEqual(["Rpt Gamma Customer"]);
      expect(await q(`from=2000-01-01&to=2000-01-31&${filter()}`)).toEqual([]);
    });

    it("fills the Applicant, Business, Co-applicant, Loan, Bank login, Sanction, Disbursal and Commission sections", async () => {
      const keys = [
        "pan", "employmentType", "employer", "monthlyIncome",
        "coApplicantCount", "coApplicantNames", "coApplicantRelations", "coApplicantIncome",
        "tenure", "purpose", "bankReferenceNo", "bankerName",
        "sanctionNo", "sanctionedAmount", "sanctionRate", "emi", "bankRm", "financial",
        "disbursedAmount", "netDisbursed", "disbursalMode", "utrNo", "loanAccountNo",
        "commissionAmount", "commissionStatus",
      ];
      const out = await sheet(`/reports/records/export?type=applications&columns=customer,${keys.join(",")}&partnerId=${partnerId}`, admin);
      expect(out.rows).toHaveLength(1);
      const row = Object.fromEntries(out.header.map((h, i) => [h, out.rows[0][i]]));
      expect(row["PAN"]).toBe("ABCDE1234F");
      expect(row["Employment type"]).toBe("Salaried");
      expect(row["Employer / business name"]).toBe("Acme Ltd");
      expect(row["Monthly income"]).toBe(90000);
      expect(row["Co-applicants / guarantors"]).toBe(1);
      expect(row["Names"]).toBe("Rpt Alpha Spouse");
      expect(row["Relations"]).toBe("Spouse");
      expect(row["Combined monthly income"]).toBe(40000);
      expect(row["Tenure (months)"]).toBe(120);
      expect(row["Purpose"]).toBe("Purchase of flat");
      expect(row["Bank reference"]).toBe("RPT-REF-1");
      expect(row["Banker"]).toBe("Banker Bhatt");
      expect(String(row["Sanction no."])).toMatch(/^SN-/);
      expect(row["Sanctioned amount"]).toBe(1800000);
      expect(row["Interest rate %"]).toBe(9.5);
      expect(row["EMI"]).toBeGreaterThan(0);
      expect(row["Bank RM"]).toBe("Rpt RM");
      expect(row["Financial"]).toBe("Approved");
      expect(row["Disbursed amount"]).toBe(1000000);
      expect(row["Net disbursed"]).toBe(990000);
      expect(row["Mode"]).toBe("RTGS");
      expect(row["UTR"]).toBe("RPTUTR001");
      expect(row["Loan account"]).toBe("RPTLAN001");
      expect(row["Gross commission"]).toBe(9000);
      expect(row["Payout status"]).toBe("Pending");
    });

    it("uses the standard columns when none are chosen, and the saved template when one is", async () => {
      const std = await sheet(`/reports/records/export?type=applications&${filter()}`, admin);
      expect(std.header).toEqual(
        ["Application no.", "Created", "Status", "Owner", "Customer", "Mobile", "Loan type", "Lender", "Requested amount", "Tenure (months)", "Bank login", "Bank reference"],
      );
      const tpl = await post("/reports/templates", admin, { type: "applications", name: "Lender view", columns: ["customer", "bankRm", "sanctionedAmount"] });
      const out = await sheet(`/reports/records/export?type=applications&templateId=${tpl.body.id}&${filter()}`, admin);
      expect(out.header).toEqual(["Customer", "Bank RM", "Sanctioned amount"]);
      expect(out.rows).toHaveLength(2);
    });

    it("exports the other registers with their own picked columns", async () => {
      const leads = await sheet(`/reports/records/export?type=leads&columns=customer,channel,partner&channel=${encodeURIComponent(SOURCE_A)}`, admin);
      expect(leads.header).toEqual(["Customer", "Lead source", "Sourcing partner"]);
      expect(leads.rows.map((r) => r[0]).sort()).toEqual(["Rpt Alpha Customer", "Rpt Gamma Customer"]);
      const san = await sheet(`/reports/records/export?type=sanctions&columns=sanctionNo,amount,emi,bankRm,disbursalStatus&${filter()}`, admin);
      expect(san.rows).toHaveLength(1);
      expect(san.rows[0][4]).toBe("Partial");
      const dis = await sheet(`/reports/records/export?type=disbursements&columns=mode,utrNo,netAmount&${filter()}`, admin);
      expect(dis.rows).toEqual([["RTGS", "RPTUTR001", 990000]]);
      const com = await sheet(`/reports/records/export?type=commissions&columns=applicationNo,amount,status&${filter()}`, manager);
      expect(com.rows).toHaveLength(1);
      expect(com.rows[0][1]).toBe(9000);
    });

    it("never lets Staff export commission, however it is asked for", async () => {
      expect((await sheet(`/reports/records/export?type=commissions`, staff)).status).toBe(403);
      // a commission column asked for next to allowed ones is dropped
      const out = await sheet(`/reports/records/export?type=applications&columns=customer,commissionAmount,commissionReceived&${filter()}`, staff);
      expect(out.status).toBe(200);
      expect(out.header).toEqual(["Customer"]);
      // ...and a request for only forbidden or unknown columns is an error, not a surprise default
      expect((await sheet(`/reports/records/export?type=applications&columns=commissionAmount`, staff)).status).toBe(400);
      expect((await sheet(`/reports/records/export?type=applications&columns=nonsense`, admin)).status).toBe(400);
      // the on-screen records never carry commission fields to Staff
      const preview = await get(`/reports/records?type=applications&columns=customer,commissionAmount&${filter()}`, staff);
      expect(JSON.stringify(preview.body)).not.toMatch(/commission/i);
      const everything = await get(`/reports/records?type=applications&${filter()}`, staff);
      expect(JSON.stringify(everything.body)).not.toMatch(/commission/i);
      // and only the columns asked for (or the standard set) travel with the rows
      expect(Object.keys(everything.body.rows[0]).sort()).toEqual(everything.body.columns.map((c: any) => c.key).sort());
    });

    it("scopes Staff exports to their own files", async () => {
      const out = await sheet(`/reports/records/export?type=applications&columns=customer&q=Rpt`, staff);
      expect(out.rows.map((r) => r[0]).sort()).toEqual(["Rpt Alpha Customer", "Rpt Beta Customer"]);
      const theirs = await sheet(`/reports/records/export?type=applications&columns=customer&q=Rpt`, other);
      expect(theirs.rows.map((r) => r[0])).toEqual(["Rpt Gamma Customer"]);
    });

    it("still offers CSV with the same columns", async () => {
      const res = await get(`/reports/records/export?type=applications&columns=customer,lender&format=csv&${filter()}`, admin);
      expect(res.status).toBe(200);
      expect(res.text).toContain("Customer,Lender");
      expect(res.text).toContain("Rpt Alpha Customer,Rpt Test Bank");
      expect(res.text).not.toContain("Requested amount");
    });

    it("doesn't cap the number of rows: every lead matching comes out", async () => {
      // Bulk-load leads (one request) to go well past the on-screen preview batch of 500 reads.
      const rows = Array.from({ length: 620 }, (_, i) => ({ name: `Rpt Bulk ${i}`, phone: `9${String(100000000 + i).slice(0, 9)}`, channel: "RPT Bulk Source" }));
      for (let i = 0; i < rows.length; i += 200) expect((await post("/leads/bulk", admin, { rows: rows.slice(i, i + 200) })).status).toBe(201);
      try {
        const count = (await get(`/leads?channel=${encodeURIComponent("RPT Bulk Source")}&pageSize=1`, admin)).body.total;
        expect(count).toBeGreaterThan(500);
        const out = await sheet(`/reports/records/export?type=leads&columns=customer&channel=${encodeURIComponent("RPT Bulk Source")}`, admin);
        expect(out.rows).toHaveLength(count);
      } finally {
        // The e2e database is shared with other spec files (which page through the lead list): leave it as found.
        await app.get(PrismaService).lead.deleteMany({ where: { channel: "RPT Bulk Source" } });
      }
    });
  });
});
