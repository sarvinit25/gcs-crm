import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";

const API = "/crm/api";

/** Day-to-day behaviour: duplicates, reminders, archiving and the yearly tidy-up. */
describe("lifecycle", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let staff: string;

  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (path: string, t: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) =>
    http.post(`${API}${path}`).set(t ? as(t) : {}).send(body);
  const patch = (path: string, t: string, body: object) => http.patch(`${API}${path}`).set(as(t)).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);

    admin = (await post("/auth/login", undefined, { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
    await post("/team", admin, { name: "Life Staff", email: "life.staff@example.com", role: "ADVISOR", password: "StaffPass#12345" });
    staff = await signIn(post, "life.staff@example.com", "StaffPass#12345");
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("health check", () => {
    it("answers without a login and confirms the database", async () => {
      const res = await http.get(`${API}/health`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "ok", database: true });
    });
  });

  describe("duplicate warning", () => {
    it("finds an existing lead however the number is typed, and ignores junk", async () => {
      await post("/leads", admin, { name: "Dupe Person", phone: "9000055555", source: "e2e" });
      for (const typed of ["9000055555", "+91 90000 55555", "09000055555"]) {
        const res = await get(`/leads/duplicates?phone=${encodeURIComponent(typed)}`, admin);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({ kind: "lead", canOpen: true });
      }
      expect((await get("/leads/duplicates?phone=123", admin)).body).toEqual([]);
      expect((await get("/leads/duplicates?phone=9111111111", admin)).body).toEqual([]);
    });

    it("tells Staff a number exists without letting them open someone else's record", async () => {
      const res = await get("/leads/duplicates?phone=9000055555", staff);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].canOpen).toBe(false);
    });
  });

  describe("reminders", () => {
    it("lists an overdue follow-up, accepting a plain date", async () => {
      const created = await post("/leads", admin, { name: "Overdue Person", phone: "9000066666", source: "e2e", nextFollowUpAt: "2020-01-05" });
      expect(created.status).toBe(201);
      const { items, urgent } = (await get("/notifications", admin)).body;
      const mine = items.find((i: { title: string }) => i.title === "Follow up with Overdue Person");
      expect(mine).toMatchObject({ severity: "high", kind: "followup", hash: "followups" });
      expect(urgent).toBeGreaterThanOrEqual(1);
      expect(mine.detail).toMatch(/days overdue/);
    });

    it("clears itself once the follow-up is dealt with", async () => {
      const lead = (await get("/leads?search=Overdue", admin)).body.items[0];
      await patch(`/leads/${lead.id}`, admin, { status: "LOST", lostReason: "Not interested" });
      const titles = (await get("/notifications", admin)).body.items.map((i: { title: string }) => i.title);
      expect(titles).not.toContain("Follow up with Overdue Person");
    });
  });

  describe("archiving", () => {
    let leadId: string;

    beforeAll(async () => {
      leadId = (await post("/leads", admin, { name: "Archivable Person", phone: "9000077777", source: "e2e" })).body.id;
    });

    it("refuses to archive an open lead", async () => {
      expect((await post(`/leads/${leadId}/archive`, admin)).status).toBe(400);
    });

    it("Staff cannot archive anything", async () => {
      await patch(`/leads/${leadId}`, admin, { status: "CONVERTED" });
      expect((await post(`/leads/${leadId}/archive`, staff)).status).toBe(403);
    });

    it("hides an archived lead from the working list but keeps it searchable", async () => {
      expect((await post(`/leads/${leadId}/archive`, admin)).status).toBe(201);

      const working = (await get("/leads?search=Archivable", admin)).body.items;
      expect(working).toHaveLength(0);
      const archived = (await get("/leads?search=Archivable&archived=true", admin)).body.items;
      expect(archived).toHaveLength(1);

      const hits = (await get("/search?q=Archivable", admin)).body.groups.find((g: { type: string }) => g.type === "leads").hits;
      expect(hits[0].subtitle).toMatch(/archived/);
      expect((await get(`/leads/${leadId}`, admin)).status).toBe(200);
    });

    it("restores it", async () => {
      await post(`/leads/${leadId}/unarchive`, admin);
      expect((await get("/leads?search=Archivable", admin)).body.items).toHaveLength(1);
    });
  });

  describe("yearly tidy-up", () => {
    it("is for Super Admin only", async () => {
      expect((await get("/maintenance/archive-preview?months=12", staff)).status).toBe(403);
      expect((await post("/maintenance/archive", staff, { months: 12 })).status).toBe(403);
    });

    it("previews, then archives only finished files that have been quiet long enough", async () => {
      const old = (await post("/leads", admin, { name: "Ancient Lost", phone: "9000088888", source: "e2e" })).body.id;
      const recent = (await post("/leads", admin, { name: "Recent Lost", phone: "9000099990", source: "e2e" })).body.id;
      const open = (await post("/leads", admin, { name: "Ancient Open", phone: "9000099991", source: "e2e" })).body.id;
      for (const id of [old, recent]) await patch(`/leads/${id}`, admin, { status: "LOST", lostReason: "Not interested" });
      const twoYearsAgo = new Date(Date.now() - 730 * 86_400_000);
      await prisma.lead.updateMany({ where: { id: { in: [old, open] } }, data: { updatedAt: twoYearsAgo } });

      const preview = (await get("/maintenance/archive-preview?months=12", admin)).body;
      expect(preview.leads).toBe(1);

      const run = (await post("/maintenance/archive", admin, { months: 12 })).body;
      expect(run.leads).toBe(1);

      const state = async (id: string) => (await prisma.lead.findUnique({ where: { id } }))!.archivedAt !== null;
      expect(await state(old)).toBe(true);
      expect(await state(recent)).toBe(false);
      expect(await state(open)).toBe(false); // still open, however old
      expect((await get("/maintenance/archive-preview?months=12", admin)).body.leads).toBe(0);
    });
  });
});
