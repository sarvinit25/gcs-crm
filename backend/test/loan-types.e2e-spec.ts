import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

type LoanType = { id: string; name: string; slug: string; code: string | null; icon: string | null; secured: boolean; active: boolean; leadCount: number; applicationCount: number; documentTypeCount: number };

/** The admin-managed list of loan types, and the document types that hang off it. */
describe("loan types", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (p: string, t?: string) => http.get(`${API}${p}`).set(t ? as(t) : {});
  const send = (m: "post" | "patch" | "delete", p: string, t: string, body: object = {}) => http[m](`${API}${p}`).set(as(t)).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("lists the seeded loan types with their code, picture and collateral flag", async () => {
    const res = await get("/loan-types", admin);
    expect(res.status).toBe(200);
    const home = (res.body as LoanType[]).find((t) => t.slug === "home-loan");
    expect(home).toMatchObject({ code: "HOME_LOAN", icon: "home", secured: true, active: true });
    expect(home!.documentTypeCount).toBeGreaterThan(0);
    const personal = (res.body as LoanType[]).find((t) => t.slug === "personal-loan");
    expect(personal!.secured).toBe(false);
  });

  it("adds, edits and deletes a loan type that nothing uses", async () => {
    const made = await send("post", "/loan-types", admin, {
      name: "Test Gold Loan",
      slug: "test-gold-loan",
      code: "tgl",
      category: "Personal",
      color: "#f5b849",
      secured: true,
      minAmount: 50000,
      maxAmount: 2500000,
    });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ code: "TGL", secured: true, active: true });

    const edited = await send("patch", `/loan-types/${made.body.id}`, admin, { description: "Loan against gold ornaments", maxAmount: 3000000 });
    expect(edited.status).toBe(200);
    expect(edited.body.description).toBe("Loan against gold ornaments");

    expect((await send("delete", `/loan-types/${made.body.id}`, admin)).status).toBe(200);
    const left = (await get("/loan-types", admin)).body as LoanType[];
    expect(left.some((t) => t.slug === "test-gold-loan")).toBe(false);
  });

  it("refuses duplicates, a bad slug and an upside-down amount range", async () => {
    const dupSlug = await send("post", "/loan-types", admin, { name: "Another Home", slug: "home-loan" });
    expect(dupSlug.status).toBe(409);
    const dupCode = await send("post", "/loan-types", admin, { name: "Another Home", slug: "another-home", code: "home_loan" });
    expect(dupCode.status).toBe(409);
    expect((await send("post", "/loan-types", admin, { name: "Bad Slug", slug: "Bad Slug!" })).status).toBe(400);
    expect((await send("post", "/loan-types", admin, { name: "Backwards", slug: "backwards", minAmount: 900, maxAmount: 100 })).status).toBe(400);
  });

  it("cannot delete a loan type that leads use, but can switch it off", async () => {
    const types = (await get("/loan-types", admin)).body as LoanType[];
    const used = types.find((t) => t.slug === "car-refinance")!;
    const lead = await send("post", "/leads", admin, { name: "Loan Type Probe", phone: "9811100001", source: "manual-entry", productSlug: used.slug });
    expect([lead.status, lead.body.message]).toEqual([201, undefined]);

    const del = await send("delete", `/loan-types/${used.id}`, admin);
    expect(del.status).toBe(409);
    expect(del.body.message).toMatch(/Switch it off/);

    const off = await send("patch", `/loan-types/${used.id}`, admin, { active: false });
    expect(off.body.active).toBe(false);
    const pick = (await get("/loan-products", admin)).body as { slug: string }[];
    expect(pick.some((t) => t.slug === "car-refinance")).toBe(false);
    await send("patch", `/loan-types/${used.id}`, admin, { active: true });
  });

  it("is for admins: staff can pick loan types but not manage them", async () => {
    const staffEmail = "types.staff@example.com";
    await send("post", "/team", admin, { name: "Types Staff", email: staffEmail, phone: "9000066656", role: "ADVISOR", password: "StaffPass#12345" });
    const staff = await signIn(
      (path, token, body) => http.post(`${API}${path}`).set(token ? as(token) : {}).send(body),
      staffEmail,
      "StaffPass#12345",
    );
    expect((await get("/loan-products", staff)).status).toBe(200);
    expect((await get("/loan-types", staff)).status).toBe(403);
    expect((await send("post", "/loan-types", staff, { name: "Nope Loan", slug: "nope-loan" })).status).toBe(403);
    expect((await get("/loan-types")).status).toBe(401);
  });
});
