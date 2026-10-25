import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

type Lender = { id: string; name: string; shortName: string | null; brokerCode: string | null; defaultCommission: string | null; portalUrl: string | null; notes: string | null; policyCount: number; activePolicyCount: number; relationshipManager: { name: string } | null };

/** The lender page: its extra details, its policies and people, and adding one loan type to many lenders. */
describe("lender details", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (p: string, t?: string) => http.get(`${API}${p}`).set(t ? as(t) : {});
  const send = (m: "post" | "patch" | "delete", p: string, t: string, body: object = {}) => http[m](`${API}${p}`).set(as(t)).send(body);
  const loanId = async (slug: string) => ((await get("/loan-types", admin)).body as { id: string; slug: string }[]).find((t) => t.slug === slug)!.id;

  let a: Lender, b: Lender;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("keeps the short name, broker code, commission, portal, branch and notes, and trims empty text to nothing", async () => {
    const made = await send("post", "/lenders", admin, {
      name: "Detail Test Bank",
      type: "BANK",
      shortName: "DTB",
      brokerCode: " BRK-001 ",
      defaultCommission: 1.25,
      portalUrl: "https://partner.detailtestbank.example/login",
      branchName: "Fort Branch",
      branchCity: "Mumbai",
      branchAddress: "12 Horniman Circle",
      notes: "   ",
    });
    expect(made.status).toBe(201);
    a = made.body;
    expect(made.body).toMatchObject({ shortName: "DTB", brokerCode: "BRK-001", branchCity: "Mumbai", notes: null });
    expect(Number(made.body.defaultCommission)).toBe(1.25);

    const edited = await send("patch", `/lenders/${a.id}`, admin, { portalUrl: null, notes: "Prefers email" });
    expect(edited.body).toMatchObject({ portalUrl: null, notes: "Prefers email" });
    expect((await send("post", "/lenders", admin, { name: "Bad Portal Bank", type: "BANK", portalUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await send("post", "/lenders", admin, { name: "Rich Bank", type: "BANK", defaultCommission: 120 })).status).toBe(400);

    b = (await send("post", "/lenders", admin, { name: "Detail Test NBFC", type: "NBFC" })).body;
  });

  it("lists each lender with its policy counts and the first contact as relationship manager", async () => {
    await send("post", "/lender-contacts", admin, { lenderId: a.id, name: "Asha Rao", designation: "Relationship Manager", phone: "9811400001", email: "asha@dtb.example" });
    const list = (await get("/lenders", admin)).body as Lender[];
    const row = list.find((l) => l.id === a.id)!;
    expect(row.relationshipManager).toMatchObject({ name: "Asha Rao" });
    expect(row.policyCount).toBe(0);
    expect(list.find((l) => l.id === b.id)!.relationshipManager).toBeNull();
  });

  it("adds one loan type to several lenders at once, skipping lenders that already have it", async () => {
    const lap = await loanId("loan-against-property");
    const terms = { loanProductId: lap, minAmount: 500000, maxAmount: 50000000, minTenureMonths: 12, maxTenureMonths: 180, rateType: "FLOATING", minRate: 8.5, maxRate: 12, processingFee: "0.5%", commissionPercent: 1.1, minCreditScore: 700, maxFoirPercent: 55, minBusinessVintageMonths: 24, notes: "Bulk test" };
    const first = await send("post", "/lender-policies/bulk", admin, { ...terms, lenderIds: [a.id, b.id] });
    expect(first.status).toBe(201);
    expect(first.body.created.sort()).toEqual(["Detail Test Bank", "Detail Test NBFC"]);
    expect(first.body.skipped).toEqual([]);

    const again = await send("post", "/lender-policies/bulk", admin, { ...terms, minRate: 9, lenderIds: [a.id] });
    expect(again.body).toMatchObject({ created: [], skipped: ["Detail Test Bank"] });

    const detail = (await get(`/lenders/${a.id}`, admin)).body;
    expect(detail.policies).toHaveLength(1);
    expect(detail.policies[0]).toMatchObject({ rateType: "FLOATING", minTenureMonths: 12, maxTenureMonths: 180, minCreditScore: 700, foirBands: [{ upTo: null, value: 55 }] });
    expect(Number(detail.policies[0].commissionPercent)).toBe(1.1);
    expect(detail.policies[0].loanProduct.slug).toBe("loan-against-property");
    expect(detail.contacts.map((c: { name: string }) => c.name)).toEqual(["Asha Rao"]);
    // The skipped lender kept its original terms.
    expect(Number(detail.policies[0].minRate)).toBe(8.5);
  });

  it("refuses a bulk add with no lenders, an unknown lender, upside-down tenure or a bad rate type", async () => {
    const lap = await loanId("loan-against-property");
    expect((await send("post", "/lender-policies/bulk", admin, { loanProductId: lap, lenderIds: [] })).status).toBe(400);
    expect((await send("post", "/lender-policies/bulk", admin, { loanProductId: lap, lenderIds: ["nobody"] })).status).toBe(400);
    const hl = await loanId("home-loan");
    expect((await send("post", "/lender-policies/bulk", admin, { loanProductId: hl, lenderIds: [b.id], minTenureMonths: 240, maxTenureMonths: 60 })).status).toBe(400);
    expect((await send("post", "/lender-policies/bulk", admin, { loanProductId: hl, lenderIds: [b.id], rateType: "WOBBLY" })).status).toBe(400);
  });

  it("staff can read a lender page but cannot change lenders or bulk-add policies", async () => {
    const email = "lender.staff@example.com";
    await send("post", "/team", admin, { name: "Lender Staff", email, phone: "9000066658", role: "ADVISOR", password: "StaffPass#12345" });
    const staff = await signIn((path, token, body) => http.post(`${API}${path}`).set(token ? as(token) : {}).send(body), email, "StaffPass#12345");
    expect((await get(`/lenders/${a.id}`, staff)).status).toBe(200);
    expect((await send("patch", `/lenders/${a.id}`, staff, { notes: "x" })).status).toBe(403);
    expect((await send("post", "/lender-policies/bulk", staff, { loanProductId: await loanId("home-loan"), lenderIds: [a.id] })).status).toBe(403);
    expect((await get("/lenders/does-not-exist", admin)).status).toBe(404);
  });
});
