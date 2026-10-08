/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";

const API = "/crm/api";

/** The bank / NBFC relationship-manager directory. */
describe("lender contacts", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let manager: string;
  let staff: string;
  let hdfcId: string;

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t?: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(as(t)).send(body);
  const patch = (path: string, t: string, body: object) => http.patch(`${API}${path}`).set(as(t)).send(body);
  const del = (path: string, t: string) => http.delete(`${API}${path}`).set(as(t));

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    admin = (await post("/auth/login", undefined, { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
    await post("/team", admin, { name: "LC Manager", email: "lc.manager@example.com", role: "MANAGER", password: "StaffPass#12345" });
    await post("/team", admin, { name: "LC Staff", email: "lc.staff@example.com", role: "ADVISOR", password: "StaffPass#12345" });
    manager = await signIn(post, "lc.manager@example.com", "StaffPass#12345");
    staff = await signIn(post, "lc.staff@example.com", "StaffPass#12345");
    hdfcId = (await prisma.lender.findUniqueOrThrow({ where: { name: "HDFC Bank" } })).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("is seeded from the client's sheet, with the lenders it introduced kept off the public website", async () => {
    const all = (await get("/lender-contacts", staff)).body as any[];
    expect(all.length).toBeGreaterThanOrEqual(55);
    expect(all.find((c) => c.name === "Rahul Astana")).toMatchObject({ lender: { name: "HDFC Bank" }, phone: "9820592765", segments: ["Business Loan"] });

    const added = await prisma.lender.findUniqueOrThrow({ where: { name: "UGRO Capital" } });
    expect(added.isPublic).toBe(false);
    const publicNames = ((await get("/public/lenders")).body as any[]).map((l) => l.name);
    expect(publicNames).not.toContain("UGRO Capital");
    expect(publicNames).toContain("HDFC Bank");
  });

  it("needs a login, and is never part of the public feed", async () => {
    expect((await get("/lender-contacts")).status).toBe(401);
    const body = JSON.stringify((await get("/public/lenders")).body);
    expect(body).not.toContain("9820592765");
    expect(body).not.toContain("hdfcbank.com");
  });

  it("lets every signed-in person search it, finding any word across name, number, email or lender", async () => {
    const hits = async (q: string) => ((await get(`/lender-contacts?search=${encodeURIComponent(q)}`, staff)).body as any[]).map((c) => c.name);
    expect(await hits("sachin")).toEqual(["Sachin Mishra"]);
    expect(await hits("7977114209")).toEqual(["Sachin Mishra"]);
    expect(await hits("+91 79771 14209")).toEqual(["Sachin Mishra"]);
    expect(await hits("icicibank.com")).toEqual(["Sachin Mishra"]);
    expect(await hits("godrej sonali")).toEqual(["Sonali Mishra"]);
    expect(await hits("zzzz-nobody")).toEqual([]);
    const machinery = ((await get("/lender-contacts?segment=Machinery%20Loan", staff)).body as any[]).map((c) => c.name);
    expect(machinery).toEqual(["Roshan Thorat"]);
    const byLender = (await get(`/lender-contacts?lenderId=${hdfcId}`, staff)).body as any[];
    expect(byLender.every((c) => c.lender.id === hdfcId)).toBe(true);
  });

  it("offers the loan types to file contacts under: the configured list plus any already in use", async () => {
    const segments = (await get("/lender-contacts/segments", staff)).body as string[];
    expect(segments).toEqual(expect.arrayContaining(["Business Loan", "Small Business Loan", "Overdraft", "Machinery Loan", "Secured Loan"]));
    expect(new Set(segments).size).toBe(segments.length);
  });

  it("is found by the global search, by name, number or email, and leads to the lender", async () => {
    const find = async (q: string) => {
      const res = (await get(`/search?q=${encodeURIComponent(q)}`, staff)).body as any;
      return res.groups.find((g: any) => g.type === "lenderContacts");
    };
    const byName = await find("sachin mishra");
    expect(byName.hits[0]).toMatchObject({ title: "Sachin Mishra", path: "/lenders", hash: expect.stringMatching(/^lender-/) });
    expect(byName.hits[0].subtitle).toContain("ICICI Bank");
    expect((await find("+91 79771 14209")).hits[0].title).toBe("Sachin Mishra");
    expect((await find("sachin.mishra6@icicibank.com")).hits[0].title).toBe("Sachin Mishra");
    // admins are sent to Settings, where they manage lenders
    const asAdmin = ((await get("/search?q=sachin", admin)).body as any).groups.find((g: any) => g.type === "lenderContacts");
    expect(asAdmin.hits[0].path).toBe("/settings");
  });

  it("shows how many contacts each lender has in the lender list", async () => {
    const lenders = (await get("/lenders", staff)).body as any[];
    expect(lenders.find((l) => l.name === "Godrej Capital").contactCount).toBe(3);
    expect(lenders.find((l) => l.name === "SBI").contactCount).toBe(0);
  });

  describe("keeping it up to date", () => {
    let id: string;

    it("is for admins and managers, not staff", async () => {
      const body = { lenderId: hdfcId, name: "Test Person", phone: "9000000001" };
      expect((await post("/lender-contacts", staff, body)).status).toBe(403);
      const made = await post("/lender-contacts", manager, { ...body, designation: "Branch Manager", email: " Test.Person@HDFCBANK.com ", segments: ["Secured Loan"] });
      expect(made.status).toBe(201);
      id = made.body.id;
      expect(made.body).toMatchObject({ email: "test.person@hdfcbank.com", segments: ["Secured Loan"], lender: { name: "HDFC Bank" } });
      expect((await patch(`/lender-contacts/${id}`, staff, { name: "Hacked" })).status).toBe(403);
      expect((await del(`/lender-contacts/${id}`, staff)).status).toBe(403);
    });

    it("tidies phone numbers however they were typed, and refuses bad ones", async () => {
      const typed = await post("/lender-contacts", admin, { lenderId: hdfcId, name: "Typed Number", phone: "+91 98765-43210" });
      expect(typed.body.phone).toBe("9876543210");
      expect((await post("/lender-contacts", admin, { lenderId: hdfcId, name: "Bad Number", phone: "12345" })).status).toBe(400);
      expect((await post("/lender-contacts", admin, { lenderId: hdfcId, name: "Bad Email", email: "nope" })).status).toBe(400);
      expect((await post("/lender-contacts", admin, { lenderId: "no-such-lender", name: "Nobody" })).status).toBe(404);
      await del(`/lender-contacts/${typed.body.id}`, admin);
    });

    it("won't list the same number twice at one lender", async () => {
      const dup = await post("/lender-contacts", admin, { lenderId: hdfcId, name: "Someone Else", phone: "9000000001" });
      expect(dup.status).toBe(409);
      expect(dup.body.message).toMatch(/Test Person/);
    });

    it("can be edited, deactivated (hidden from the default list) and removed — all in the audit trail", async () => {
      const edited = await patch(`/lender-contacts/${id}`, admin, { designation: "Area Manager", phone: "", notes: "Left the bank" });
      expect(edited.body).toMatchObject({ designation: "Area Manager", phone: null });
      expect((await patch(`/lender-contacts/${id}`, admin, { active: false })).status).toBe(200);
      expect(((await get("/lender-contacts?search=Test%20Person", staff)).body as any[]).length).toBe(0);
      expect(((await get("/lender-contacts?search=Test%20Person&includeInactive=true", staff)).body as any[]).length).toBe(1);

      expect((await del(`/lender-contacts/${id}`, admin)).status).toBe(200);
      expect((await del(`/lender-contacts/${id}`, admin)).status).toBe(404);
      const trail = await prisma.auditLog.findMany({ where: { entity: "LenderContact", entityId: id }, orderBy: { createdAt: "asc" } });
      expect(trail.map((t) => t.action)).toEqual(["CREATE", "UPDATE", "UPDATE", "DELETE"]);
    });
  });
});
