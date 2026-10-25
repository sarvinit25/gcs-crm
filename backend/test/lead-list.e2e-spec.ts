import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

type Item = { id: string; name: string; lastContactAt: string | null; contactCount: number };

/** What the lead list offers beyond plain paging: who owns it, who brought it, when we last spoke, and counts per loan type. */
describe("lead list", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (p: string, t: string) => http.get(`${API}${p}`).set(as(t));
  const send = (m: "post" | "patch", p: string, t: string, body: object = {}) => http[m](`${API}${p}`).set(as(t)).send(body);
  const names = async (q: string, t = admin) => ((await get(`/leads?pageSize=100&search=ListProbe${q}`, t)).body.items as Item[]).map((i) => i.name).sort();

  let officer: string, partner: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
    officer = (await send("post", "/team", admin, { name: "List Officer", email: "list.officer@example.com", phone: "9000066660", role: "ADVISOR", password: "StaffPass#12345" })).body.id;
    partner = (await send("post", "/partners", admin, { name: "List Partner", phone: "9000066702", commissionRate: 15 })).body.id;
    await send("post", "/leads", admin, { name: "ListProbe Own", phone: "9811500001", source: "manual-entry", assignedOfficerId: officer, productSlug: "home-loan" });
    await send("post", "/leads", admin, { name: "ListProbe Partner", phone: "9811500002", source: "manual-entry", sourcingPartnerId: partner, productSlug: "home-loan" });
    await send("post", "/leads", admin, { name: "ListProbe Loose", phone: "9811500003", source: "manual-entry", productSlug: "personal-loan" });
  });
  afterAll(async () => {
    await app?.close();
  });

  it("filters by owner, including leads nobody owns, and by who brought the lead", async () => {
    expect(await names(`&assignedOfficerId=${officer}`)).toEqual(["ListProbe Own"]);
    expect(await names("&assignedOfficerId=none")).toEqual(["ListProbe Loose", "ListProbe Partner"]);
    expect(await names(`&sourcingPartnerId=${partner}`)).toEqual(["ListProbe Partner"]);
    expect(await names("&sourcingPartnerId=none")).toEqual(["ListProbe Loose", "ListProbe Own"]);
  });

  it("shows when we last logged a call or note on each lead", async () => {
    const before = ((await get("/leads?search=ListProbe%20Own", admin)).body.items as Item[])[0];
    expect(before).toMatchObject({ lastContactAt: null, contactCount: 0 });
    await send("post", `/leads/${before.id}/follow-ups`, admin, { note: "Spoke to the customer" });
    const after = ((await get("/leads?search=ListProbe%20Own", admin)).body.items as Item[])[0];
    expect(after.contactCount).toBe(1);
    expect(after.lastContactAt).not.toBeNull();
  });

  it("counts working leads per loan type, busiest first", async () => {
    const res = (await get("/leads/loan-types", admin)).body as { total: number; types: { name: string; count: number }[] };
    expect(res.total).toBeGreaterThanOrEqual(3);
    const counts = res.types.map((t) => t.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(res.types.find((t) => t.name === "Home Loan")!.count).toBeGreaterThanOrEqual(2);
  });

  it("counts only an advisor's own leads for that advisor", async () => {
    const staff = await signIn((path, token, body) => http.post(`${API}${path}`).set(token ? as(token) : {}).send(body), "list.officer@example.com", "StaffPass#12345");
    const res = (await get("/leads/loan-types", staff)).body as { total: number; types: { name: string; count: number }[] };
    expect(res.total).toBe(1);
    expect(res.types).toEqual([expect.objectContaining({ name: "Home Loan", count: 1 })]);
  });
});
