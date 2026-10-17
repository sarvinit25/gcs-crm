import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { PrismaService } from "../src/prisma/prisma.service";
import { OtpSenderService } from "../src/chat-auth/otp-sender.service";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };
// Set before the app starts: a test number with a fixed code.
process.env["CHAT_OTP_TEST_PHONES"] = "9888800002";
process.env["CHAT_OTP_TEST_CODE"] = "135790";

/** "Do not have a GCS ID?": a code to the mobile, then the ID by SMS, never on the page. */
describe("GCS ID recovery", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let codes: { phone: string; code: string }[] = [];
  let ids: { phone: string; id: string }[] = [];
  let n = 0;
  const phone = () => `9${String(66000000 + ++n).padStart(9, "0")}`;

  const post = (path: string, body: object = {}, t?: string) =>
    http.post(`${API}${path}`).set(t ? { Authorization: `Bearer ${t}` } : {}).send(body);
  const ask = (kind: string, p: string) => post("/public/id-recovery/send", { kind, phone: p });
  const confirm = (kind: string, p: string, code: string) => post("/public/id-recovery/verify", { kind, phone: p, code });
  const lastCode = (p: string) => [...codes].reverse().find((c) => c.phone === p)!.code;
  const cooled = (p: string) =>
    prisma.idRecoveryOtp.updateMany({ where: { phone: p }, data: { createdAt: new Date(Date.now() - 60_000) } });

  const newClient = async (p: string) => {
    const products = (await http.get(`${API}/loan-products`).set({ Authorization: `Bearer ${admin}` })).body as { id: string }[];
    const res = await post(
      "/applications",
      { loanProductId: products[0].id, requestedAmount: 1000000, applicants: [{ name: "Recovery Client", phone: p, isPrimary: true }] },
      admin,
    );
    return (await http.get(`${API}/applications/${res.body.id}`).set({ Authorization: `Bearer ${admin}` })).body.portalAccessCode as string;
  };
  const newPartner = async (p: string) =>
    (await post("/partners", { name: "Recovery Partner", phone: p, commissionRate: 20, password: "PartnerPass#1234" }, admin)).body.code as string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    const sender = app.get(OtpSenderService);
    jest.spyOn(sender, "send").mockImplementation(async (p, code) => {
      codes.push({ phone: p, code });
      return true;
    });
    jest.spyOn(sender, "sendGcsId").mockImplementation(async (p, id) => {
      ids.push({ phone: p, id });
      return true;
    });
    admin = (await post("/auth/login", ADMIN)).body.accessToken;
  });

  beforeEach(() => {
    codes = [];
    ids = [];
  });

  afterAll(async () => {
    await app?.close();
  });

  it("sends a client their access code by SMS after they confirm their number, and never shows it", async () => {
    const p = phone();
    const accessCode = await newClient(p);
    const sent = await ask("client", p);
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ sent: true, resendAfterSeconds: 30 });
    expect(codes).toHaveLength(1);

    const done = await confirm("client", p, lastCode(p));
    expect(done.status).toBe(201);
    expect(done.body).toEqual({ sent: true });
    expect(JSON.stringify(done.body)).not.toContain(accessCode);
    expect(ids).toEqual([{ phone: p, id: accessCode }]);
  });

  it("sends a partner their partner GCS ID", async () => {
    const p = phone();
    const partnerId = await newPartner(p);
    expect(partnerId).toMatch(/^GCS-/);
    expect((await ask("partner", p)).status).toBe(201);
    expect((await confirm("partner", p, lastCode(p))).status).toBe(201);
    expect(ids).toEqual([{ phone: p, id: partnerId }]);
  });

  it("looks only for the kind asked: a client number does not yield a partner ID", async () => {
    const p = phone();
    await newClient(p);
    expect((await ask("partner", p)).status).toBe(201);
    expect(codes).toHaveLength(0);
  });

  it("answers the same for a number with no ID, but sends it no code and no ID", async () => {
    const p = phone();
    const sent = await ask("client", p);
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ sent: true, resendAfterSeconds: 30 });
    expect(codes).toHaveLength(0);
    // the cooldown applies to every number alike
    expect((await ask("client", p)).status).toBe(429);
    const wrong = await confirm("client", p, "123456");
    expect(wrong.status).toBe(400);
    expect(ids).toHaveLength(0);
  });

  it("a wrong code is refused and counted, and five wrong tries kill the code", async () => {
    const p = phone();
    await newClient(p);
    await ask("client", p);
    const right = lastCode(p);
    const bad = right === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) expect((await confirm("client", p, bad)).status).toBe(400);
    expect((await confirm("client", p, right)).status).toBe(400);
    expect(ids).toHaveLength(0);
  });

  it("a code works once, and a new request kills the old code", async () => {
    const p = phone();
    await newClient(p);
    await ask("client", p);
    const first = lastCode(p);
    await cooled(p);
    await ask("client", p);
    expect((await confirm("client", p, first)).status).toBe(400);
    const second = lastCode(p);
    expect((await confirm("client", p, second)).status).toBe(201);
    expect((await confirm("client", p, second)).status).toBe(400);
    expect(ids).toHaveLength(1);
  });

  it("a code asked for as a client cannot fetch a partner ID", async () => {
    const p = phone();
    await newClient(p);
    await newPartner(p).catch(() => undefined);
    await ask("client", p);
    expect((await confirm("partner", p, lastCode(p))).status).toBe(400);
  });

  it("is limited to five codes an hour for one number", async () => {
    const p = phone();
    await newClient(p);
    for (let i = 0; i < 5; i++) {
      await cooled(p);
      expect((await ask("client", p)).status).toBe(201);
    }
    await cooled(p);
    expect((await ask("client", p)).status).toBe(429);
  });

  it("a test number gets the fixed code and no SMS", async () => {
    const test = "9888800002";
    await newClient(test);
    expect((await ask("client", test)).status).toBe(201);
    expect(codes).toHaveLength(0);
    expect((await confirm("client", test, "135790")).status).toBe(201);
    expect(ids).toHaveLength(1);
  });

  it("refuses a malformed number, kind or code", async () => {
    expect((await ask("client", "12345")).status).toBe(400);
    expect((await ask("staff", "9876543210")).status).toBe(400);
    expect((await confirm("client", "9876543210", "12")).status).toBe(400);
  });

  describe("partner sign-in with a GCS ID", () => {
    it("accepts the partner's own ID in any casing or spacing, and refuses another one", async () => {
      const p = phone();
      const code = await newPartner(p);
      const login = (c?: string) => post("/partner/auth/login", { phone: p, password: "PartnerPass#1234", ...(c ? { code: c } : {}) });
      expect((await login(code)).status).toBe(201);
      expect((await login(code.toLowerCase().replace(/-/g, " "))).status).toBe(201);
      expect((await login("GCS-XXX-999")).status).toBe(401);
      // callers that never sent one still sign in
      expect((await login()).status).toBe(201);
    });
  });
});
