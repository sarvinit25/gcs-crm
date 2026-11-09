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
    const all = (await get("/lender-contacts", staff)).body;
    expect(all.total).toBeGreaterThanOrEqual(4500);
    expect(all.items).toHaveLength(50);
    const rahul = (await get("/lender-contacts?search=Rahul%20Astana", staff)).body.items;
    expect(rahul[0]).toMatchObject({ lender: { name: "HDFC Bank" }, phone: "9820592765", segments: ["Business Loan"], kind: "RELATIONSHIP" });

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
    const hits = async (q: string) => ((await get(`/lender-contacts?search=${encodeURIComponent(q)}&limit=200`, staff)).body.items as any[]).map((c) => c.name);
    expect(await hits("sachin mishra")).toContain("Sachin Mishra");
    expect(await hits("7977114209")).toEqual(["Sachin Mishra"]);
    expect(await hits("+91 79771 14209")).toEqual(["Sachin Mishra"]);
    expect(await hits("sachin.mishra6@icicibank.com")).toEqual(["Sachin Mishra"]);
    expect(await hits("godrej sonali mishra")).toContain("Sonali Mishra");
    expect(await hits("zzzz-nobody")).toEqual([]);
    const machinery = ((await get("/lender-contacts?segment=Machinery%20Loan&limit=200", staff)).body.items as any[]).map((c) => c.name);
    expect(machinery).toContain("Roshan Thorat");
    const byLender = (await get(`/lender-contacts?lenderId=${hdfcId}`, staff)).body.items as any[];
    expect(byLender.length).toBeGreaterThan(0);
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
    // admins land on the same Lenders page, where they manage lenders
    const asAdmin = ((await get("/search?q=sachin", admin)).body as any).groups.find((g: any) => g.type === "lenderContacts");
    expect(asAdmin.hits[0].path).toBe("/lenders");
  });

  it("shows how many contacts each lender has in the lender list", async () => {
    const lenders = (await get("/lenders", staff)).body as any[];
    expect(lenders.find((l) => l.name === "Godrej Capital").contactCount).toBeGreaterThanOrEqual(3);
    expect(lenders.find((l) => l.name === "Cholamandalam").contactCount).toBeGreaterThan(1000);
  });

  describe("the regional and branch directory loaded from the banker lists", () => {
    it("pages through everyone, relationship managers before regional / branch names, and filters by kind, place and lender", async () => {
      const first = (await get("/lender-contacts?limit=10", staff)).body;
      expect(first.items).toHaveLength(10);
      expect(first.items.every((c: any) => c.kind === "RELATIONSHIP")).toBe(true);
      const second = (await get("/lender-contacts?limit=10&page=2", staff)).body;
      expect(second.items.map((c: any) => c.id)).not.toEqual(expect.arrayContaining(first.items.map((c: any) => c.id)));

      const directory = (await get("/lender-contacts?kind=DIRECTORY&limit=200", staff)).body;
      expect(directory.total).toBeGreaterThan(3000);
      expect(directory.items.every((c: any) => c.kind === "DIRECTORY")).toBe(true);

      const rajkot = (await get("/lender-contacts?city=Rajkot&limit=200", staff)).body;
      expect(rajkot.total).toBeGreaterThan(50);
      expect(rajkot.items.every((c: any) => c.city === "Rajkot")).toBe(true);
      expect((await get("/lender-contacts?limit=500", staff)).status).toBe(400);
    });

    it("finds people by town, state, branch or territory, and carries their escalation chain", async () => {
      const dombivli = (await get("/lender-contacts?search=dombivli&limit=200", staff)).body.items as any[];
      expect(dombivli.some((c) => c.lender.name === "PNB Housing")).toBe(true);
      const ambit = (await get("/lender-contacts?search=prince%20malhotra", staff)).body.items[0];
      expect(ambit).toMatchObject({ lender: { name: "Ambit" }, phone: "9311839921", city: "Delhi" });
      expect(ambit.escalation.map((e: any) => e.name)).toEqual(["Suneel Yadav", "Ravi Harjai"]);
      expect(ambit.coverage).toContain("Ghaziabad");
    });

    it("keeps numbers that look incomplete out of the phone field, with a note", async () => {
      const rows = (await get("/lender-contacts?search=Agrim&limit=200", staff)).body.items as any[];
      const flagged = rows.filter((c) => c.notes?.includes("looks incomplete"));
      expect(flagged.length).toBeGreaterThan(0);
      expect(flagged.every((c) => c.phone === null)).toBe(true);
    });

    it("lists the states and towns people are filed under", async () => {
      const places = (await get("/lender-contacts/places", staff)).body;
      expect(places.states).toEqual(expect.arrayContaining(["Maharashtra", "Gujarat", "Karnataka"]));
      expect(places.cities.some((c: any) => c.city === "Rajkot" && c.state === "Gujarat")).toBe(true);
    });

    it("lets an admin record where a person sits, and refuses an unknown kind", async () => {
      const made = await post("/lender-contacts", admin, { lenderId: hdfcId, name: "Placed Person", city: " Nagpur ", state: "Maharashtra", kind: "DIRECTORY", phone: "9000000077" });
      expect(made.status).toBe(201);
      expect(made.body).toMatchObject({ city: "Nagpur", state: "Maharashtra", kind: "DIRECTORY" });
      expect((await patch(`/lender-contacts/${made.body.id}`, admin, { city: "" })).body.city).toBeNull();
      expect((await post("/lender-contacts", admin, { lenderId: hdfcId, name: "Odd Kind", kind: "BOSS" })).status).toBe(400);
      await del(`/lender-contacts/${made.body.id}`, admin);
    });
  });

  describe("broker codes, payouts and branches", () => {
    let chola: string;
    beforeAll(async () => {
      chola = (await prisma.lender.findUniqueOrThrow({ where: { name: "Cholamandalam" } })).id;
    });

    it("shows a lender's codes to everyone, but the payout only to admins and managers", async () => {
      const hdfc = (await get(`/lenders/${hdfcId}`, staff)).body;
      expect(hdfc.codes[0]).toMatchObject({ product: "New Car Loan", code: "300573", registeredName: expect.stringMatching(/FINWIZZ/i), payoutText: null, payoutPercent: null });
      const asManager = (await get(`/lenders/${hdfcId}`, manager)).body;
      expect(asManager.codes[0].payoutText).toBe("Payout based on Rate & PF");
      const icici = (await prisma.lender.findUniqueOrThrow({ where: { name: "ICICI Bank" } })).id;
      const rows = (await get(`/lenders/${icici}`, admin)).body.codes as any[];
      expect(rows.find((c) => c.product === "New Car Loan").payoutPercent).toBe("1");
      expect(rows.find((c) => c.product === "Educational Loan").payoutText).toBe("1.18% (Inc of GST)");
      expect((await get(`/lenders/${icici}`, staff)).body.codes.every((c: any) => c.payoutText === null)).toBe(true);
    });

    it("reports counts on the lender list, and the first few people on the lender page", async () => {
      const list = (await get("/lenders", staff)).body as any[];
      expect(list.find((l) => l.name === "HDFC Bank").codeCount).toBe(1);
      expect(list.find((l) => l.name === "Cholamandalam").branchCount).toBeGreaterThan(700);
      const detail = (await get(`/lenders/${chola}`, staff)).body;
      expect(detail.contacts).toHaveLength(5);
      expect(detail.contactCount).toBeGreaterThan(1000);
      expect(detail.branchCount).toBeGreaterThan(700);
    });

    it("pages and searches a lender's branches, including where DSA files are not taken", async () => {
      const page = (await get(`/lenders/${chola}/branches?limit=20`, staff)).body;
      expect(page.items).toHaveLength(20);
      const hit = (await get(`/lenders/${chola}/branches?search=chandauli`, staff)).body;
      expect(hit.items[0]).toMatchObject({ name: "Chandauli Hl", state: "Uttar Pradesh" });
      const aadhar = (await prisma.lender.findUniqueOrThrow({ where: { name: "Aadhar Housing" } })).id;
      const blocked = (await get(`/lenders/${aadhar}/branches?search=not%20allowed`, staff)).body.items as any[];
      expect(blocked.map((b) => b.name)).toEqual(expect.arrayContaining(["Vizag"]));
      expect((await prisma.lender.findUniqueOrThrow({ where: { id: aadhar } })).notes).toMatch(/DSA sourcing not allowed/);
    });

    it("lets admins and managers keep codes up to date — audited, and not staff", async () => {
      const body = { lenderId: hdfcId, product: "Home Loan", code: "HL-TEST-1", payoutText: "0.5% of disbursal", payoutPercent: 0.5, contactPhone: "+91 98765 43210" };
      expect((await post("/lender-codes", staff, body)).status).toBe(403);
      const made = await post("/lender-codes", manager, body);
      expect(made.status).toBe(201);
      expect(made.body).toMatchObject({ code: "HL-TEST-1", contactPhone: "9876543210" });
      expect((await post("/lender-codes", admin, { ...body, contactPhone: "123" })).status).toBe(400);
      expect((await post("/lender-codes", admin, { ...body, lenderId: "nope" })).status).toBe(404);
      const id = made.body.id;
      expect((await patch(`/lender-codes/${id}`, staff, { code: "X" })).status).toBe(403);
      const edited = await patch(`/lender-codes/${id}`, admin, { payoutText: "", active: false });
      expect(edited.body).toMatchObject({ payoutText: null, active: false });
      expect((await del(`/lender-codes/${id}`, staff)).status).toBe(403);
      expect((await del(`/lender-codes/${id}`, admin)).status).toBe(200);
      expect((await del(`/lender-codes/${id}`, admin)).status).toBe(404);
      const trail = await prisma.auditLog.findMany({ where: { entity: "LenderCode", entityId: id }, orderBy: { createdAt: "asc" } });
      expect(trail.map((t) => t.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
    });
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
      expect((await get("/lender-contacts?search=Test%20Person", staff)).body.items).toHaveLength(0);
      expect((await get("/lender-contacts?search=Test%20Person&includeInactive=true", staff)).body.items).toHaveLength(1);

      expect((await del(`/lender-contacts/${id}`, admin)).status).toBe(200);
      expect((await del(`/lender-contacts/${id}`, admin)).status).toBe(404);
      const trail = await prisma.auditLog.findMany({ where: { entity: "LenderContact", entityId: id }, orderBy: { createdAt: "asc" } });
      expect(trail.map((t) => t.action)).toEqual(["CREATE", "UPDATE", "UPDATE", "DELETE"]);
    });
  });
});
