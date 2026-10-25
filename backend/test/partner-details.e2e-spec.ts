import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

/** A sourcing partner's address, tax and bank details. */
describe("partner details", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (p: string, t: string) => http.get(`${API}${p}`).set(as(t));
  const send = (m: "post" | "patch", p: string, t: string, body: object = {}) => http[m](`${API}${p}`).set(as(t)).send(body);

  const base = { name: "Detail Partner", firm: "Detail & Co", phone: "9000066701", commissionRate: 20 };
  let id: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("keeps address, PAN, GST and bank details, tidying the codes to capitals", async () => {
    const made = await send("post", "/partners", admin, {
      ...base,
      address: "12 Link Road",
      state: "Maharashtra",
      pincode: "400084",
      pan: "abcde1234f",
      gstin: "27abcde1234f1z5",
      bankName: "HDFC Bank",
      accountNumber: "50100123456789",
      ifsc: "hdfc0001234",
      accountHolder: "Detail & Co",
      notes: "Introduced by a builder",
    });
    expect(made.status).toBe(201);
    id = made.body.id;
    expect(made.body).toMatchObject({ pan: "ABCDE1234F", gstin: "27ABCDE1234F1Z5", ifsc: "HDFC0001234", accountLast4: "6789", state: "Maharashtra" });
  });

  it("never sends the full account number in the roster, only with the partner's own record", async () => {
    const row = ((await get("/partners", admin)).body as { id: string; accountNumber?: string; accountLast4: string }[]).find((p) => p.id === id)!;
    expect(row.accountLast4).toBe("6789");
    expect(row.accountNumber).toBeUndefined();
    const one = (await get(`/partners/${id}`, admin)).body;
    expect(one).toMatchObject({ accountNumber: "50100123456789", address: "12 Link Road", pincode: "400084", notes: "Introduced by a builder" });
    expect(one.passwordHash).toBeUndefined();
  });

  it("masks the account and PAN numbers in the audit log", async () => {
    await send("patch", `/partners/${id}`, admin, { accountNumber: "50100999988887", pan: "ZZZZZ9999Z", bankName: "ICICI Bank" });
    const log = JSON.stringify((await get(`/audit?entity=SourcingPartner&entityId=${id}&pageSize=50`, admin)).body);
    expect(log).toContain("••••8887");
    expect(log).toContain("ICICI Bank");
    expect(log).not.toContain("50100999988887");
    expect(log).not.toContain("50100123456789");
    expect(log).not.toContain("ZZZZZ9999Z");
  });

  it("clears a detail with an empty value, and refuses malformed ones", async () => {
    const cleared = await send("patch", `/partners/${id}`, admin, { gstin: null, notes: "   " });
    expect(cleared.status).toBe(200);
    const one = (await get(`/partners/${id}`, admin)).body;
    expect(one.gstin).toBeNull();
    expect(one.notes).toBeNull();
    for (const bad of [{ pan: "123" }, { gstin: "NOTAGST" }, { ifsc: "HDFC1234567" }, { pincode: "40008" }, { accountNumber: "12AB" }]) {
      expect((await send("patch", `/partners/${id}`, admin, bad)).status).toBe(400);
    }
  });

  it("is hidden from other staff: advisors cannot read the roster or one partner", async () => {
    const email = "partner.staff@example.com";
    await send("post", "/team", admin, { name: "Partner Staff", email, phone: "9000066659", role: "ADVISOR", password: "StaffPass#12345" });
    const staff = await signIn((path, token, body) => http.post(`${API}${path}`).set(token ? as(token) : {}).send(body), email, "StaffPass#12345");
    expect((await get(`/partners/${id}`, staff)).status).toBe(403);
    expect((await get("/partners", staff)).status).toBe(403);
    const assignable = ((await get("/partners/assignable", staff)).body as Record<string, unknown>[]).find((p) => p.id === id)!;
    expect(assignable.accountNumber).toBeUndefined();
    expect(assignable.pan).toBeUndefined();
  });
});
