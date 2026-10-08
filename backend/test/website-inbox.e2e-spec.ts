/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";

const API = "/crm/api";

/** Entries from the public website: logged as received, de-duplicated into one lead per person. */
describe("website inbox", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let manager: string;
  let staff: string;
  let n = 0;
  const phone = () => `9${String(55000000 + ++n).padStart(9, "0")}`;

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t?: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(as(t)).send(body);
  const send = (body: object) => post("/public/leads", undefined, body);
  const leadsFor = (p: string) => prisma.lead.findMany({ where: { phone: p }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    admin = (await post("/auth/login", undefined, { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
    await post("/team", admin, { name: "WS Manager", email: "ws.manager@example.com", role: "MANAGER", password: "StaffPass#12345" });
    await post("/team", admin, { name: "WS Staff", email: "ws.staff@example.com", role: "ADVISOR", password: "StaffPass#12345" });
    manager = await signIn(post, "ws.manager@example.com", "StaffPass#12345");
    staff = await signIn(post, "ws.staff@example.com", "StaffPass#12345");
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("one lead per person", () => {
    it("logs every entry but creates a single lead when the same person sends the form twice", async () => {
      const p = phone();
      const a = await send({ name: "Rahul Sharma", phone: p, source: "checklist-download" });
      const b = await send({ name: "rahul  SHARMA", phone: p, source: "checklist-download" });
      expect(b.status).toBe(201);
      expect(b.body.id).toBe(a.body.id);
      expect(await leadsFor(p)).toHaveLength(1);

      const rows = await prisma.websiteSubmission.findMany({ where: { phone: p }, orderBy: { receivedAt: "asc" } });
      expect(rows.map((r) => r.outcome)).toEqual(["NEW_LEAD", "DUPLICATE_KEPT"]);
      expect(rows.every((r) => r.leadId === a.body.id)).toBe(true);
    });

    it("keeps the fuller entry whichever arrives first", async () => {
      const p = phone();
      await send({ name: "Priya Verma", phone: p, source: "checklist-download" });
      const fuller = await send({ name: "Priya Verma", phone: p, source: "contact-form", email: "Priya@Example.com", city: "Pune", amount: 4_000_000, detail: "Home loan, salaried" });
      const [lead] = await leadsFor(p);
      expect(fuller.body.id).toBe(lead!.id);
      expect(lead).toMatchObject({ email: "priya@example.com", city: "Pune", source: "checklist-download" });
      expect(Number(lead!.amount)).toBe(4_000_000);
      expect(lead!.notes).toBe("Home loan, salaried");
      const rows = await prisma.websiteSubmission.findMany({ where: { phone: p }, orderBy: { receivedAt: "asc" } });
      expect(rows.map((r) => r.outcome)).toEqual(["NEW_LEAD", "DUPLICATE_UPDATED"]);
      expect(rows.map((r) => r.entries)).toEqual([2, 6]);

      // Now the thin one arrives again: it must not wipe the fuller details.
      await send({ name: "Priya Verma", phone: p, source: "checklist-download" });
      const [after] = await leadsFor(p);
      expect(after).toMatchObject({ email: "priya@example.com", city: "Pune" });
      expect(Number(after!.amount)).toBe(4_000_000);
    });

    it("never touches what staff own when merging", async () => {
      const p = phone();
      const first = await send({ name: "Staff Owned", phone: p, source: "contact-form", city: "Thane" });
      const officer = (await prisma.user.findFirstOrThrow({ where: { email: "ws.staff@example.com" } })).id;
      await prisma.lead.update({ where: { id: first.body.id }, data: { status: "CONTACTED", assignedOfficerId: officer, notes: "Called, wants a callback" } });
      await send({ name: "Staff Owned", phone: p, source: "contact-form", city: "Thane", email: "so@example.com", detail: "needs 50 lakh" });
      const [lead] = await leadsFor(p);
      expect(lead).toMatchObject({ status: "CONTACTED", assignedOfficerId: officer, email: "so@example.com" });
      expect(lead!.notes).toContain("Called, wants a callback");
      expect(lead!.notes).toContain("needs 50 lakh");
    });

    it("matches a phone typed with +91 or spaces, and a shorter form of the name", async () => {
      const p = phone();
      const a = await send({ name: "Amit Kumar Joshi", phone: p, source: "contact-form" });
      const b = await send({ name: "Amit Joshi", phone: `+91 ${p.slice(0, 5)} ${p.slice(5)}`, source: "ca-legal-enquiry" });
      expect(b.body.id).toBe(a.body.id);
      expect(await leadsFor(p)).toHaveLength(1);
    });

    it("keeps people who share a phone but have different names, and flags it", async () => {
      const p = phone();
      const a = await send({ name: "Sunita Rao", phone: p, source: "contact-form" });
      const b = await send({ name: "Vikram Rao", phone: p, source: "contact-form" });
      expect(b.body.id).not.toBe(a.body.id);
      expect(await leadsFor(p)).toHaveLength(2);
      const rows = await prisma.websiteSubmission.findMany({ where: { phone: p }, orderBy: { receivedAt: "asc" } });
      expect(rows.map((r) => r.sharedPhone)).toEqual([false, true]);
    });

    it("the same name on a different phone is a different person", async () => {
      const a = await send({ name: "Same Name", phone: phone(), source: "contact-form" });
      const b = await send({ name: "Same Name", phone: phone(), source: "contact-form" });
      expect(b.body.id).not.toBe(a.body.id);
    });

    it("a closed or archived lead does not swallow a fresh enquiry", async () => {
      const p = phone();
      const first = await send({ name: "Came Back", phone: p, source: "contact-form" });
      await prisma.lead.update({ where: { id: first.body.id }, data: { status: "LOST" } });
      const again = await send({ name: "Came Back", phone: p, source: "contact-form" });
      expect(again.body.id).not.toBe(first.body.id);

      await prisma.lead.update({ where: { id: again.body.id }, data: { archivedAt: new Date() } });
      const third = await send({ name: "Came Back", phone: p, source: "contact-form" });
      expect(third.body.id).not.toBe(again.body.id);
    });

    it("two identical entries arriving at the same moment still make one lead", async () => {
      const p = phone();
      const results = await Promise.all([1, 2, 3].map(() => send({ name: "Double Click", phone: p, source: "contact-form" })));
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await leadsFor(p)).toHaveLength(1);
      expect(await prisma.websiteSubmission.count({ where: { phone: p } })).toBe(3);
    });

    it("records an audit entry when a merge changed a lead, none when nothing changed", async () => {
      const p = phone();
      const a = await send({ name: "Audit Me", phone: p, source: "contact-form" });
      await send({ name: "Audit Me", phone: p, source: "contact-form" });
      expect(await prisma.auditLog.count({ where: { entity: "Lead", entityId: a.body.id } })).toBe(0);
      await send({ name: "Audit Me", phone: p, source: "contact-form", city: "Pune" });
      const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "Lead", entityId: a.body.id } });
      expect(log).toMatchObject({ action: "UPDATE", actorType: "CLIENT", actorName: "Website form" });
      expect(log.changes).toMatchObject({ city: { from: null, to: "Pune" } });
    });
  });

  describe("the inbox", () => {
    it("lists entries newest first with the lead they belong to, plus period totals", async () => {
      const p = phone();
      const a = await send({ name: "Inbox Person", phone: p, source: "partner-signup" });
      await send({ name: "Inbox Person", phone: p, source: "partner-signup" });
      const res = await get(`/website-submissions?search=${p}`, manager);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items[0]).toMatchObject({ outcome: "DUPLICATE_KEPT", lead: { id: a.body.id, name: "Inbox Person" } });
      expect(res.body.summary.received).toBeGreaterThanOrEqual(2);
      expect(res.body.summary.newLeads).toBeGreaterThanOrEqual(1);
      expect(res.body.forms.map((f: any) => f.form)).toContain("partner-signup");
    });

    it("tells each row how many other entries share its lead, and can list just those", async () => {
      const p = phone();
      const a = await send({ name: "Twice Over", phone: p, source: "contact-form" });
      await send({ name: "Twice Over", phone: p, source: "checklist-download" });
      await send({ name: "Twice Over", phone: p, source: "ca-legal-enquiry" });
      const lone = await send({ name: "Only Once", phone: phone(), source: "contact-form" });

      const rows = (await get(`/website-submissions?search=${p}`, admin)).body.items;
      expect(rows).toHaveLength(3);
      expect(rows.every((r: any) => r.others === 2)).toBe(true);
      const solo = (await get("/website-submissions?search=Only Once", admin)).body.items;
      expect(solo[0].others).toBe(0);

      const forLead = await get(`/website-submissions?leadId=${a.body.id}`, admin);
      expect(forLead.body.total).toBe(3);
      expect(forLead.body.items.map((r: any) => r.form).sort()).toEqual(["ca-legal-enquiry", "checklist-download", "contact-form"]);
      expect((await get(`/website-submissions?leadId=${lone.body.id}`, admin)).body.total).toBe(1);
    });

    it("filters by form, outcome, shared phone and search", async () => {
      const p = phone();
      await send({ name: "Filter One", phone: p, source: "ca-legal-enquiry" });
      await send({ name: "Filter Two", phone: p, source: "ca-legal-enquiry" });
      const byForm = await get("/website-submissions?form=ca-legal-enquiry&pageSize=100", admin);
      expect(byForm.body.items.every((r: any) => r.form === "ca-legal-enquiry")).toBe(true);
      const shared = await get("/website-submissions?sharedPhone=true&pageSize=100", admin);
      expect(shared.body.items.length).toBeGreaterThanOrEqual(1);
      expect(shared.body.items.every((r: any) => r.sharedPhone)).toBe(true);
      const dupes = await get("/website-submissions?outcome=DUPLICATE_KEPT&pageSize=100", admin);
      expect(dupes.body.items.every((r: any) => r.outcome === "DUPLICATE_KEPT")).toBe(true);
      expect((await get("/website-submissions?outcome=NOPE", admin)).status).toBe(400);
      expect((await get(`/website-submissions?search=${p}`, admin)).body.total).toBe(2);
    });

    it("is closed to Staff and signed-out visitors", async () => {
      expect((await get("/website-submissions", staff)).status).toBe(403);
      expect((await get("/website-submissions")).status).toBe(401);
      expect((await get("/website-submissions", admin)).status).toBe(200);
    });
  });
});
