import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };
const STAFF = { email: "staff.e2e@example.com", password: "StaffPass#12345", phone: "9000099999" };

/**
 * The rules that must never regress: Staff see only their own files, the three
 * portals' tokens are never interchangeable, and admin-only screens stay closed.
 */
describe("permissions", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let staff: string;
  let staffId: string;
  let ownLeadId: string;
  let otherLeadId: string;
  let applicationId: string;

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token?: string) => http.get(`${API}${path}`).set(token ? as(token) : {});
  const post = (path: string, token: string | undefined, body: object) =>
    http.post(`${API}${path}`).set(token ? as(token) : {}).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;

    admin = (await post("/auth/login", undefined, ADMIN)).body.accessToken;
    expect(admin).toBeTruthy();

    const created = await post("/team", admin, {
      name: "E2E Staff",
      email: STAFF.email,
      phone: STAFF.phone,
      role: "ADVISOR",
      password: STAFF.password,
    });
    staffId = created.body.id;
    staff = await signIn(post, STAFF.email, STAFF.password);

    ownLeadId = (await post("/leads", admin, { name: "Mine Kulkarni", phone: "9000011111", source: "e2e", assignedOfficerId: staffId })).body.id;
    otherLeadId = (await post("/leads", admin, { name: "Theirs Deshmukh", phone: "9000022222", source: "e2e" })).body.id;

    const products = (await get("/loan-products", admin)).body as { id: string }[];
    const application = await post("/applications", admin, {
      loanProductId: products[0].id,
      requestedAmount: 1000000,
      ownerId: staffId,
      applicants: [{ name: "Borrower Bhosale", phone: "9000033333", isPrimary: true }],
    });
    applicationId = application.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("signed-out visitors", () => {
    it.each(["/leads", "/applications", "/search?q=abc", "/notifications", "/team", "/dashboard/summary"])(
      "%s requires a login",
      async (path) => {
        expect((await get(path)).status).toBe(401);
      },
    );
  });

  describe("Staff see only their own files", () => {
    it("lists only leads assigned to them", async () => {
      const names = (await get("/leads", staff)).body.items.map((l: { name: string }) => l.name);
      expect(names).toContain("Mine Kulkarni");
      expect(names).not.toContain("Theirs Deshmukh");
    });

    it("cannot open someone else's lead", async () => {
      expect((await get(`/leads/${ownLeadId}`, staff)).status).toBe(200);
      expect((await get(`/leads/${otherLeadId}`, staff)).status).toBe(404);
    });

    it("search never reveals other people's leads, or people and logs", async () => {
      const res = await get("/search?q=e2e&limit=25", staff);
      const leads = res.body.groups.find((g: { type: string }) => g.type === "leads")?.hits ?? [];
      expect(leads.every((h: { title: string }) => h.title !== "Theirs Deshmukh")).toBe(true);
      const types = res.body.groups.map((g: { type: string }) => g.type);
      expect(types).not.toContain("team");
      expect(types).not.toContain("audit");
      expect(types).not.toContain("partners");

      const other = await get("/search?q=Deshmukh", staff);
      expect(other.body.groups.find((g: { type: string }) => g.type === "leads")).toBeUndefined();
    });

    it("reports only include their own records", async () => {
      const rows = (await get("/reports/records?type=leads", staff)).body.rows as { customer: string }[];
      expect(rows.map((r) => r.customer)).toEqual(["Mine Kulkarni"]);
    });

    it("the firm-wide dashboard numbers are scoped to them", async () => {
      expect((await get("/dashboard/summary", staff)).body.leads.total).toBe(1);
      expect((await get("/dashboard/summary", admin)).body.leads.total).toBeGreaterThanOrEqual(2);
    });

    it("admin sees everything in search", async () => {
      const res = await get("/search?q=Deshmukh", admin);
      expect(res.body.groups.find((g: { type: string }) => g.type === "leads").hits).toHaveLength(1);
    });
  });

  describe("admin-only areas stay closed to Staff", () => {
    it.each(["/team", "/partners", "/commissions", "/audit", "/settings", "/payroll?month=9&year=2026", "/reports/by-officer"])(
      "%s is forbidden",
      async (path) => {
        expect((await get(path, staff)).status).toBe(403);
        expect((await get(path, admin)).status).toBe(200);
      },
    );

    it("Staff cannot create staff accounts or change roles", async () => {
      const res = await post("/team", staff, { name: "X Y", email: "x@y.in", role: "ADMIN", password: "LongEnoughPass#1" });
      expect(res.status).toBe(403);
    });
  });

  describe("commission economics are for Admin and Manager only", () => {
    it("Staff get no commission totals, ledger or reports", async () => {
      expect((await get("/dashboard/summary", staff)).body.commissionEarned).toBeNull();
      expect((await get("/dashboard/summary", admin)).body.commissionEarned).not.toBeNull();
      expect((await get("/reports/records?type=commissions", staff)).status).toBe(403);
      expect((await get("/reports/records/export?type=commissions", staff)).status).toBe(403);
      expect((await get("/reports/records?type=commissions", admin)).status).toBe(200);
    });

    it("Staff only learn that a payout has a commission, never the amounts or splits", async () => {
      const put = (path: string, body: object) => http.put(`${API}${path}`).set(as(admin)).send(body);
      await put(`/applications/${applicationId}/sanction`, {
        technicalStatus: "APPROVED",
        financialStatus: "APPROVED",
        legalStatus: "APPROVED",
        sanctionedAmount: 1000000,
      });
      const payout = await post(`/applications/${applicationId}/disbursements`, admin, {
        amount: 400000,
        disbursedAt: "2026-09-20",
      });
      expect(payout.status).toBe(201);
      const commission = await post(`/disbursements/${payout.body.id}/commission`, admin, { grossRate: 1.5 });
      expect(commission.status).toBe(201);

      const adminView = (await get(`/applications/${applicationId}/disbursements`, admin)).body;
      expect(adminView.items[0].commission.grossAmount).toBeDefined();

      const staffView = (await get(`/applications/${applicationId}/disbursements`, staff)).body;
      expect(staffView.items).toHaveLength(1);
      expect(staffView.items[0].commission).toEqual({ id: expect.any(String) });
      expect(JSON.stringify(staffView)).not.toMatch(/grossAmount|splits|sharePercent/);
      expect((await get(`/disbursements/${payout.body.id}/commission`, staff)).status).toBe(403);
    });
  });

  describe("the three portals never share tokens", () => {
    let partner: string;
    let borrower: string;

    beforeAll(async () => {
      await post("/partners", admin, { name: "E2E Partner", phone: "9000044444", commissionRate: 20, password: "PartnerPass#1234" });
      partner = (await post("/partner/auth/login", undefined, { phone: "9000044444", password: "PartnerPass#1234" })).body.accessToken;

      const code = (await get(`/applications/${applicationId}`, admin)).body.portalAccessCode as string;
      borrower = (await post("/borrower/auth/login", undefined, { phone: "9000033333", accessCode: code })).body.accessToken;
    });

    it("each portal's own token works on its own area", async () => {
      expect(partner).toBeTruthy();
      expect(borrower).toBeTruthy();
      expect((await get("/partner/me", partner)).status).toBe(200);
      expect((await get("/borrower/me", borrower)).status).toBe(200);
    });

    it("a partner token is useless on staff and borrower endpoints", async () => {
      for (const path of ["/leads", "/applications", "/search?q=abc", "/borrower/me"]) {
        expect([401, 403]).toContain((await get(path, partner)).status);
      }
    });

    it("a borrower token is useless on staff and partner endpoints", async () => {
      for (const path of ["/leads", `/applications/${applicationId}`, "/search?q=abc", "/partner/me"]) {
        expect([401, 403]).toContain((await get(path, borrower)).status);
      }
    });

    it("a staff token is useless on partner and borrower endpoints", async () => {
      for (const path of ["/partner/me", "/borrower/me"]) {
        expect([401, 403]).toContain((await get(path, staff)).status);
      }
    });

    it("the borrower sees only their own file and no internal fields", async () => {
      const me = (await get("/borrower/me", borrower)).body;
      expect(me.applicationNo).toBeTruthy();
      expect(JSON.stringify(me)).not.toMatch(/commission|portalAccessCode|passwordHash|notes/i);
    });

    it("a wrong access code is refused", async () => {
      const res = await post("/borrower/auth/login", undefined, { phone: "9000033333", accessCode: "WRONGCODE" });
      expect([400, 401]).toContain(res.status);
    });
  });
});
