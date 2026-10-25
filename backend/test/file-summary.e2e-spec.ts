import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

/** The money on a file at a glance: sanctioned, disbursed, and the commission only managers see. */
describe("file summary", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (p: string, t: string) => http.get(`${API}${p}`).set(as(t));
  const send = (m: "post" | "put", p: string, t: string, body: object = {}) => http[m](`${API}${p}`).set(as(t)).send(body);

  let fileId: string;
  let staff: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
    const email = "summary.staff@example.com";
    const user = (await send("post", "/team", admin, { name: "Summary Staff", email, phone: "9000066661", role: "ADVISOR", password: "StaffPass#12345" })).body.id;
    staff = await signIn((path, token, body) => http.post(`${API}${path}`).set(token ? as(token) : {}).send(body), email, "StaffPass#12345");
    const product = ((await get("/loan-products", admin)).body as { id: string }[])[0].id;
    fileId = (await send("post", "/applications", admin, { loanProductId: product, requestedAmount: 1000000, ownerId: user, applicants: [{ name: "Summary Probe", isPrimary: true, phone: "9811800001" }] })).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("starts at nothing sanctioned, nothing disbursed, and no commission", async () => {
    const res = (await get(`/applications/${fileId}`, admin)).body;
    expect(res.summary).toEqual({ sanctionedAmount: 0, disbursedAmount: 0, processingFee: 0, commissionAmount: 0 });
  });

  it("adds up what was sanctioned, disbursed and charged", async () => {
    const s1 = await send("put", `/applications/${fileId}/sanction`, admin, { financialStatus: "APPROVED", sanctionedAmount: 900000, interestRate: 9.5, tenureMonths: 120 });
    const d1 = await send("post", `/applications/${fileId}/disbursements`, admin, { amount: 400000, disbursedAt: "2026-10-01", processingFee: 4000 });
    const d2 = await send("post", `/applications/${fileId}/disbursements`, admin, { amount: 300000, disbursedAt: "2026-10-05", processingFee: 3000 });
    expect([s1.status, d1.status, d2.status, d1.body.message]).toEqual([200, 201, 201, undefined]);
    const res = (await get(`/applications/${fileId}`, admin)).body;
    expect(res.summary).toMatchObject({ sanctionedAmount: 900000, disbursedAmount: 700000, processingFee: 7000 });
  });

  it("hides the commission from the advisor who owns the file", async () => {
    const res = (await get(`/applications/${fileId}`, staff)).body;
    expect(res.summary.commissionAmount).toBeNull();
    expect(res.summary.disbursedAmount).toBe(700000);
  });
});
