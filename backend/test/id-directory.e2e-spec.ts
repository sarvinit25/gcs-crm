/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";

/** One list of every GCS reference, for the main admin only. */
describe("GCS ID directory", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let manager: string;
  let staff: string;
  let staffId: string;
  let leadId: string;
  let applicationId: string;
  let partnerCode: string;

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t?: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(as(t)).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await post("/auth/login", undefined, { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;

    await post("/team", admin, { name: "Dir Manager", email: "dir.manager@example.com", role: "MANAGER", password: "StaffPass#12345" });
    manager = await signIn(post, "dir.manager@example.com", "StaffPass#12345");
    staffId = (await post("/team", admin, { name: "Dir Staff", email: "dir.staff@example.com", role: "ADVISOR", password: "StaffPass#12345" })).body.id;
    staff = await signIn(post, "dir.staff@example.com", "StaffPass#12345");

    const partner = await post("/partners", admin, { name: "Directory Partner", firm: "Dir & Co", phone: "9000077001", commissionRate: 20 });
    expect(partner.status).toBe(201);
    partnerCode = partner.body.code;
    leadId = (await post("/leads", admin, { name: "Directory Lead", phone: "9000077002", source: "e2e" })).body.id;
    const products = (await get("/loan-products", admin)).body as { id: string }[];
    const application = await post("/applications", admin, {
      loanProductId: products[0]!.id,
      requestedAmount: 2000000,
      ownerId: staffId,
      applicants: [{ name: "Directory Client", phone: "9000077003", isPrimary: true }],
    });
    applicationId = application.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("is for the main admin only", async () => {
    expect((await get("/id-directory/summary", admin)).status).toBe(200);
    for (const who of [manager, staff]) {
      expect((await get("/id-directory/summary", who)).status).toBe(403);
      expect((await get("/id-directory?type=leads", who)).status).toBe(403);
    }
    expect((await get("/id-directory/summary")).status).toBe(401);
  });

  it("counts every lead, application and partner", async () => {
    const s = (await get("/id-directory/summary", admin)).body;
    expect(s.leads).toBeGreaterThan(0);
    expect(s.applications).toBeGreaterThan(0);
    expect(s.partners).toBeGreaterThan(0);
  });

  it("lists applications with the number clients quote and the code they track with", async () => {
    const res = await get("/id-directory?type=applications&search=Directory Client", admin);
    expect(res.status).toBe(200);
    const row = res.body.items.find((r: any) => r.id === applicationId);
    expect(row).toMatchObject({ kind: "application", name: "Directory Client", phone: "9000077003", owner: "Dir Staff" });
    expect(row.gcsId).toMatch(/^GCS-/);
    expect(row.accessCode).toMatch(/^[A-Z0-9]{6,}$/);
  });

  it("shows the admin applications that belong to staff, which staff themselves cannot see for others", async () => {
    const other = (await get("/id-directory?type=applications&pageSize=100", admin)).body.items;
    expect(other.some((r: any) => r.id === applicationId)).toBe(true);
    expect((await get(`/applications/${applicationId}`, admin)).status).toBe(200);
  });

  it("finds an application by its client's code, its number or the client's phone", async () => {
    const code = (await get(`/applications/${applicationId}`, admin)).body.portalAccessCode as string;
    for (const q of [code, code.toLowerCase(), "9000077003"]) {
      const found = (await get(`/id-directory?type=applications&search=${encodeURIComponent(q)}`, admin)).body.items;
      expect(found.map((r: any) => r.id)).toContain(applicationId);
    }
    const no = (await get(`/id-directory?type=applications&search=${encodeURIComponent(code)}`, admin)).body.items[0].gcsId as string;
    const byNo = (await get(`/id-directory?type=applications&search=${encodeURIComponent(no)}`, admin)).body.items;
    expect(byNo.map((r: any) => r.id)).toContain(applicationId);
  });

  it("lists leads by number and by name, with no access code", async () => {
    const res = (await get("/id-directory?type=leads&search=Directory Lead", admin)).body.items;
    const row = res.find((r: any) => r.id === leadId);
    expect(row).toMatchObject({ kind: "lead", name: "Directory Lead", accessCode: null });
    expect(row.gcsId).toMatch(/^#\d+$/);
    const byNo = (await get(`/id-directory?type=leads&search=${encodeURIComponent(row.gcsId)}`, admin)).body.items;
    expect(byNo.map((r: any) => r.id)).toContain(leadId);
  });

  it("lists partners by their code, firm and phone", async () => {
    expect(partnerCode).toMatch(/^GCS-/);
    for (const q of [partnerCode, "dir & co", "9000077001"]) {
      const found = (await get(`/id-directory?type=partners&search=${encodeURIComponent(q)}`, admin)).body.items;
      expect(found.some((r: any) => r.kind === "partner" && r.name === "Directory Partner (Dir & Co)")).toBe(true);
    }
    const row = (await get(`/id-directory?type=partners&search=${encodeURIComponent(partnerCode)}`, admin)).body.items[0];
    expect(row).toMatchObject({ gcsId: partnerCode, status: "Active", accessCode: null });
  });

  it("pages its results and refuses a type it does not know", async () => {
    const page = (await get("/id-directory?type=leads&page=1&pageSize=1", admin)).body;
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect((await get("/id-directory?type=everything", admin)).status).toBe(400);
  });
});
