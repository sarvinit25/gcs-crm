import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

/** The admin-managed list of places leads come from. */
describe("lead sources", () => {
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

  it("starts with the channels the CRM has always offered, in order", async () => {
    const res = await get("/lead-sources", admin);
    expect(res.status).toBe(200);
    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).toContain("Walk-in");
    expect(names).toContain("Google Search Ads");
    expect(res.body.find((r: { name: string }) => r.name === "Referral")).toMatchObject({ code: "REF", color: "#26bf94" });
    const orders = res.body.map((r: { sortOrder: number }) => r.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("adds, edits, switches off and deletes a source; only the name is required", async () => {
    const made = await send("post", "/lead-sources", admin, { name: "Newspaper insert" });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ name: "Newspaper insert", active: true, color: "#6B7280" });
    const id = made.body.id as string;

    const edited = await send("patch", `/lead-sources/${id}`, admin, { code: "paper", color: "#e6533c", description: "Print ad response" });
    expect(edited.body).toMatchObject({ code: "PAPER", color: "#e6533c", description: "Print ad response" });

    // a switched-off source is no longer suggested on lead forms
    await send("patch", `/lead-sources/${id}`, admin, { active: false });
    expect((await get("/marketing/channels", admin)).body).not.toContain("Newspaper insert");
    await send("patch", `/lead-sources/${id}`, admin, { active: true });
    expect((await get("/marketing/channels", admin)).body).toContain("Newspaper insert");

    expect((await send("delete", `/lead-sources/${id}`, admin)).status).toBe(200);
    expect((await get("/marketing/channels", admin)).body).not.toContain("Newspaper insert");
  });

  it("refuses a duplicate name or code, and a bad colour", async () => {
    expect((await send("post", "/lead-sources", admin, { name: "Walk-in" })).status).toBe(409);
    const a = await send("post", "/lead-sources", admin, { name: "Dup code one", code: "DUPX" });
    expect(a.status).toBe(201);
    expect((await send("post", "/lead-sources", admin, { name: "Dup code two", code: "dupx" })).status).toBe(409);
    expect((await send("post", "/lead-sources", admin, { name: "Bad colour", color: "red" })).status).toBe(400);
    await send("delete", `/lead-sources/${a.body.id}`, admin);
  });

  it("will not delete a source that leads already carry, but can switch it off", async () => {
    const made = await send("post", "/lead-sources", admin, { name: "Used source" });
    await send("post", "/leads", admin, { name: "Source Tester", phone: "9000077777", source: "e2e", channel: "Used source" });
    const del = await send("delete", `/lead-sources/${made.body.id}`, admin);
    expect(del.status).toBe(409);
    expect(del.body.message).toMatch(/Switch it off/);
    expect((await send("patch", `/lead-sources/${made.body.id}`, admin, { active: false })).status).toBe(200);
  });

  it("is for admins: staff can read the channel list but not change the sources", async () => {
    const staffEmail = "sources.staff@example.com";
    await send("post", "/team", admin, { name: "Sources Staff", email: staffEmail, phone: "9000066655", role: "ADVISOR", password: "StaffPass#12345" });
    const staff = await signIn(
      (path, token, body) => http.post(`${API}${path}`).set(token ? as(token) : {}).send(body),
      staffEmail,
      "StaffPass#12345",
    );
    expect((await get("/marketing/channels", staff)).status).toBe(200);
    expect((await send("post", "/lead-sources", staff, { name: "Nope" })).status).toBe(403);
    expect((await get("/lead-sources", staff)).status).toBe(403);
  });
});
