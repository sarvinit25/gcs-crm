/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";
import { SandboxProvider } from "../src/credit/providers/credit-provider";

const API = "/crm/api";
const METHOD = "Signed consent form";

/** CIBIL scores: recording them, the (labelled) test check, consent, scoping and the list. */
describe("credit checks", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let staffA: string;
  let staffB: string;
  let staffAId: string;
  let productId: string;

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t?: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(as(t)).send(body);
  const put = (path: string, t: string, body: object) => http.put(`${API}${path}`).set(as(t)).send(body);
  const del = (path: string, t: string) => http.delete(`${API}${path}`).set(as(t));
  const setting = (key: string, value: unknown) => put(`/settings/${key}`, admin, { value });

  let phone = 0;
  /** An application owned by staff A with one fully-filled applicant. */
  async function file(over: Record<string, unknown> = {}, ownerId = staffAId) {
    const res = await post("/applications", admin, {
      loanProductId: productId,
      requestedAmount: 500000,
      ownerId,
      applicants: [{ name: "Credit Person", phone: `90004${String(20000 + phone++)}`, pan: "ABCDE1234F", dateOfBirth: "1990-05-17", isPrimary: true, ...over }],
    });
    const full = (await get(`/applications/${res.body.id}`, admin)).body;
    return { applicationId: res.body.id as string, applicantId: full.applicants[0].id as string, applicationNo: full.applicationNo as string };
  }
  const applicant = (applicationId: string) => get(`/applications/${applicationId}`, admin).then((r) => r.body.applicants[0]);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    admin = (await post("/auth/login", undefined, { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
    staffAId = (await post("/team", admin, { name: "Credit Staff A", email: "credit.a@example.com", role: "ADVISOR", password: "StaffPass#12345" })).body.id;
    await post("/team", admin, { name: "Credit Staff B", email: "credit.b@example.com", role: "ADVISOR", password: "StaffPass#12345" });
    staffA = await signIn(post, "credit.a@example.com", "StaffPass#12345");
    staffB = await signIn(post, "credit.b@example.com", "StaffPass#12345");
    productId = ((await get("/loan-products", admin)).body as { id: string }[])[0].id;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  describe("switched off (the default)", () => {
    it("says plainly that no bureau is connected, and offers the consent wording and bands", async () => {
      const s = (await get("/credit/status", staffA)).body;
      expect(s).toMatchObject({ mode: "none", live: false, available: false, simulated: false, recheckDays: 30 });
      expect(s.consentText).toMatch(/credit information report/);
      expect(s.consentMethods).toContain(METHOD);
      expect(s.bands.map((b: any) => b.key)).toEqual(["excellent", "good", "fair", "low"]);
      expect((await get("/credit/status")).status).toBe(401);
    });

    it("refuses a live check, with a way forward", async () => {
      const f = await file();
      const res = await post(`/credit/applicants/${f.applicantId}/check`, staffA, { consent: true, consentMethod: METHOD });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/not switched on.*record a score/i);
    });
  });

  describe("recording a score from a report you already have", () => {
    it("puts it on the applicant with its date, keeps it in the history, and audits it", async () => {
      const f = await file();
      const res = await post(`/credit/applicants/${f.applicantId}/record`, staffA, { score: 742, reportDate: "2026-09-20", reference: "CIR-889", note: "From the HDFC login" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ kind: "MANUAL", status: "SUCCESS", score: 742, band: "good", applied: true, reference: "CIR-889" });
      expect(await applicant(f.applicationId)).toMatchObject({ cibilScore: 742 });

      const history = (await get(`/credit/applicants/${f.applicantId}/checks`, staffA)).body;
      expect(history.applicant).toMatchObject({ score: 742, band: "good" });
      expect(history.checks).toHaveLength(1);
      expect(history.checks[0]).toMatchObject({ kind: "MANUAL", requestedBy: { name: "Credit Staff A" } });
      const trail = await prisma.auditLog.findFirst({ where: { entity: "CreditCheck", entityId: res.body.id } });
      expect(trail?.entityLabel).toContain(f.applicationNo);
      expect(JSON.stringify(trail)).not.toContain("ABCDE1234F"); // the PAN never goes in the trail
    });

    it("refuses impossible scores, future dates and stray fields", async () => {
      const f = await file();
      const rec = (body: object) => post(`/credit/applicants/${f.applicantId}/record`, staffA, body);
      expect((await rec({ score: 299, reportDate: "2026-09-20" })).status).toBe(400);
      expect((await rec({ score: 901, reportDate: "2026-09-20" })).status).toBe(400);
      expect((await rec({ score: 700.5, reportDate: "2026-09-20" })).status).toBe(400);
      expect((await rec({ score: 700, reportDate: "2099-01-01" })).status).toBe(400);
      expect((await rec({ score: 700 })).status).toBe(400);
      expect((await rec({ score: 700, reportDate: "2026-09-20", applicantId: "x" })).status).toBe(400);
    });

    it("never lets an older report replace a newer score", async () => {
      const f = await file();
      await post(`/credit/applicants/${f.applicantId}/record`, staffA, { score: 710, reportDate: "2026-09-20" });
      const older = await post(`/credit/applicants/${f.applicantId}/record`, staffA, { score: 640, reportDate: "2026-03-01" });
      expect(older.body.applied).toBe(false);
      expect(await applicant(f.applicationId)).toMatchObject({ cibilScore: 710 });
      expect((await get(`/credit/applicants/${f.applicantId}/checks`, staffA)).body.checks).toHaveLength(2); // still in the history
      const newer = await post(`/credit/applicants/${f.applicantId}/record`, staffA, { score: 760, reportDate: "2026-09-25" });
      expect(newer.body.applied).toBe(true);
      expect(await applicant(f.applicationId)).toMatchObject({ cibilScore: 760 });
    });
  });

  describe("who can reach whose applicants", () => {
    it("keeps staff to their own files; admins reach everyone", async () => {
      const f = await file();
      for (const t of [staffB]) {
        expect((await get(`/credit/applicants/${f.applicantId}/checks`, t)).status).toBe(404);
        expect((await post(`/credit/applicants/${f.applicantId}/record`, t, { score: 700, reportDate: "2026-09-20" })).status).toBe(404);
        expect((await post(`/credit/applicants/${f.applicantId}/check`, t, { consent: true, consentMethod: METHOD })).status).toBe(404);
      }
      expect((await get(`/credit/applicants/${f.applicantId}/checks`, admin)).status).toBe(200);
      const mine = ((await get(`/credit/applicants?search=${encodeURIComponent(f.applicationNo)}`, staffA)).body.items as any[]).map((a) => a.id);
      const theirs = ((await get(`/credit/applicants?search=${encodeURIComponent(f.applicationNo)}`, staffB)).body.items as any[]).map((a) => a.id);
      expect(mine).toEqual([f.applicantId]);
      expect(theirs).toEqual([]);
    });

    it("needs a login", async () => {
      expect((await get("/credit/applicants")).status).toBe(401);
      expect((await post("/credit/applicants/x/record", undefined, { score: 700, reportDate: "2026-09-20" })).status).toBe(401);
    });
  });

  describe("the test provider (sandbox) — clearly simulated, never real", () => {
    beforeAll(async () => {
      await setting("credit.provider", "sandbox");
    });
    afterAll(async () => {
      await del("/settings/credit.provider", admin);
      await del("/settings/credit.recheckDays", admin);
    });

    it("is reported as simulated", async () => {
      expect((await get("/credit/status", staffA)).body).toMatchObject({ mode: "sandbox", simulated: true, available: true, live: false });
    });

    it("needs consent, and a stated way it was given", async () => {
      const f = await file();
      const run = (body: object) => post(`/credit/applicants/${f.applicantId}/check`, staffA, body);
      expect((await run({})).status).toBe(400);
      expect((await run({ consent: false, consentMethod: METHOD })).status).toBe(400);
      expect((await run({ consent: true })).status).toBe(400);
      expect((await run({ consent: true, consentMethod: "they nodded" })).status).toBe(400);
      expect(await prisma.creditCheck.count({ where: { applicantId: f.applicantId } })).toBe(0);
    });

    it("needs what a bureau needs to find the person", async () => {
      const noPan = await file({ pan: undefined });
      const res = await post(`/credit/applicants/${noPan.applicantId}/check`, staffA, { consent: true, consentMethod: METHOD });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/PAN/);
      const noDob = await file({ dateOfBirth: undefined });
      expect((await post(`/credit/applicants/${noDob.applicantId}/check`, staffA, { consent: true, consentMethod: METHOD })).body.message).toMatch(/date of birth/);
    });

    it("returns a labelled, simulated result, keeps the consent with it, and does NOT touch the applicant's real score", async () => {
      const f = await file();
      await post(`/credit/applicants/${f.applicantId}/record`, staffA, { score: 705, reportDate: "2026-09-20" });
      const res = await post(`/credit/applicants/${f.applicantId}/check`, staffA, { consent: true, consentMethod: METHOD });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ kind: "SIMULATED", status: "SUCCESS", applied: false, consentMethod: METHOD });
      expect(res.body.score).toBeGreaterThanOrEqual(560);
      expect(res.body.reference).toMatch(/^SIM-/);
      expect(res.body.note).toMatch(/not a real credit score/i);
      expect(res.body.consentText).toMatch(/credit information report/);
      expect(res.body.consentAt).toBeTruthy();
      expect(await applicant(f.applicationId)).toMatchObject({ cibilScore: 705 }); // untouched
      const list = ((await get(`/credit/applicants?search=${encodeURIComponent(f.applicationNo)}`, staffA)).body.items as any[])[0];
      expect(list).toMatchObject({ score: 705, source: "MANUAL" }); // the list shows only real scores
    });

    it("does not repeat a recent check — staff must ask, a Super Admin can insist", async () => {
      const f = await file();
      const body = { consent: true, consentMethod: METHOD };
      expect((await post(`/credit/applicants/${f.applicantId}/check`, staffA, body)).status).toBe(201);
      const again = await post(`/credit/applicants/${f.applicantId}/check`, staffA, body);
      expect(again.status).toBe(409);
      expect(again.body.message).toMatch(/not repeated within 30 days.*ask a Super Admin/);
      expect((await post(`/credit/applicants/${f.applicantId}/check`, staffA, { ...body, force: true })).status).toBe(409); // staff can't force
      expect((await post(`/credit/applicants/${f.applicantId}/check`, admin, { ...body, force: true })).status).toBe(201);
      await setting("credit.recheckDays", 0);
      expect((await post(`/credit/applicants/${f.applicantId}/check`, staffA, body)).status).toBe(201);
      await del("/settings/credit.recheckDays", admin);
    });

    it("keeps a failure on record, tells the user nothing changed, and leaves the score alone", async () => {
      const f = await file();
      await post(`/credit/applicants/${f.applicantId}/record`, staffA, { score: 690, reportDate: "2026-09-20" });
      const spy = jest.spyOn(SandboxProvider.prototype, "fetch").mockRejectedValueOnce(new Error("bureau timed out"));
      const res = await post(`/credit/applicants/${f.applicantId}/check`, staffA, { consent: true, consentMethod: METHOD });
      expect(res.status).toBe(502);
      expect(res.body.message).toMatch(/Nothing was changed/);
      expect(res.body.message).not.toMatch(/timed out/); // internals stay out of the response
      spy.mockRestore();
      const failed = await prisma.creditCheck.findFirstOrThrow({ where: { applicantId: f.applicantId, status: "FAILED" } });
      expect(failed.error).toBe("bureau timed out");
      expect(await applicant(f.applicationId)).toMatchObject({ cibilScore: 690 });
      // a failed pull doesn't count as a recent check, so retrying works
      expect((await post(`/credit/applicants/${f.applicantId}/check`, staffA, { consent: true, consentMethod: METHOD })).status).toBe(201);
    });

    it("is refused outright on the live system", async () => {
      const f = await file();
      const before = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try {
        expect((await get("/credit/status", staffA)).body).toMatchObject({ simulated: false, available: false });
        const res = await post(`/credit/applicants/${f.applicantId}/check`, staffA, { consent: true, consentMethod: METHOD });
        expect(res.status).toBe(503);
      } finally {
        process.env.NODE_ENV = before;
      }
      expect(await prisma.creditCheck.count({ where: { applicantId: f.applicantId } })).toBe(0);
    });
  });

  describe("the list", () => {
    it("summarises scores, filters by band, and finds people without one or with an out-of-date one", async () => {
      const stale = await file({ name: "Zz Stale Person" });
      await post(`/credit/applicants/${stale.applicantId}/record`, admin, { score: 655, reportDate: "2020-01-01" });
      const none = await file({ name: "Zz No Score Person" });
      const high = await file({ name: "Zz High Person" });
      await post(`/credit/applicants/${high.applicantId}/record`, admin, { score: 810, reportDate: "2026-09-29" });

      const all = (await get("/credit/applicants?pageSize=100", admin)).body;
      expect(all.summary).toMatchObject({ checksThisMonth: expect.any(Number) });
      expect(all.summary.scored + all.summary.withoutScore).toBe(all.summary.applicants);
      expect(all.summary.averageScore).toBeGreaterThan(300);
      expect(all.items[0].score).toBeNull(); // people with no score come first — they need attention

      const ids = async (q: string) => ((await get(`/credit/applicants?pageSize=100&${q}`, admin)).body.items as any[]).map((a) => a.id);
      expect(await ids("band=fair")).toContain(stale.applicantId);
      expect(await ids("band=excellent")).toContain(high.applicantId);
      expect(await ids("band=excellent")).not.toContain(stale.applicantId);
      expect(await ids("show=none")).toContain(none.applicantId);
      expect(await ids("show=none")).not.toContain(high.applicantId);
      expect(await ids("show=stale")).toContain(stale.applicantId);
      expect(await ids("show=stale")).not.toContain(high.applicantId);
      const row = ((await get("/credit/applicants?search=Zz%20Stale", admin)).body.items as any[])[0];
      expect(row).toMatchObject({ score: 655, band: "fair", stale: true, hasPan: true, hasDob: true });
      expect(row.application.applicationNo).toBe(stale.applicationNo);
    });

    it("leaves archived files out, and only offers valid filters", async () => {
      const f = await file({ name: "Zz Archived Person" });
      await prisma.application.update({ where: { id: f.applicationId }, data: { archivedAt: new Date() } });
      expect(((await get("/credit/applicants?search=Zz%20Archived", admin)).body.items as any[]).length).toBe(0);
      expect((await get("/credit/applicants?band=superb", admin)).status).toBe(400);
      expect((await get("/credit/applicants?show=everything", admin)).status).toBe(400);
      expect((await get("/credit/applicants?pageSize=1000", admin)).status).toBe(400);
    });
  });
});
