import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { totpAt } from "../src/auth/totp";

const API = "/crm/api";

/** First-login password change and authenticator-app two-step login. */
describe("account security", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t?: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(as(t)).send(body);
  const login = (email: string, password: string) => post("/auth/login", undefined, { email, password });
  const code = (secret: string) => totpAt(secret, Date.now() / 1000);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await login("admin@growthcapitalservices.in", "ChangeMe123!")).body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("a password an admin issued must be replaced", () => {
    const email = "newhire@example.com";
    const issued = "IssuedPass#12345";
    let token: string;
    let userId: string;

    beforeAll(async () => {
      userId = (await post("/team", admin, { name: "New Hire", email, role: "ADVISOR", password: issued })).body.id;
      token = (await login(email, issued)).body.accessToken;
    });

    it("flags the account at first sign-in", async () => {
      const res = await login(email, issued);
      expect(res.body.user.mustChangePassword).toBe(true);
    });

    it("locks everything except 'who am I' and 'change password'", async () => {
      const blocked = await get("/leads", token);
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
      expect((await get("/dashboard/summary", token)).status).toBe(403);
      expect((await get("/auth/me", token)).body.mustChangePassword).toBe(true);
    });

    it("rejects a wrong current password, a same password and a weak one", async () => {
      expect((await post("/auth/change-password", token, { currentPassword: "WrongPass#1234", newPassword: "BrandNew#Pass123" })).status).toBe(400);
      expect((await post("/auth/change-password", token, { currentPassword: issued, newPassword: issued })).status).toBe(400);
      const weak = await post("/auth/change-password", token, { currentPassword: issued, newPassword: "short12" });
      expect(weak.status).toBe(400);
    });

    it("unlocks the account once they choose their own", async () => {
      const done = await post("/auth/change-password", token, { currentPassword: issued, newPassword: "BrandNew#Pass123" });
      expect(done.status).toBe(201);
      expect((await get("/leads", token)).status).toBe(200);
      expect((await login(email, issued)).status).toBe(401);
      expect((await login(email, "BrandNew#Pass123")).body.user.mustChangePassword).toBe(false);
    });

    it("an admin resetting the password locks it again", async () => {
      await post(`/team/${userId}/reset-password`, admin, { password: "ResetByAdmin#123" });
      const session = (await login(email, "ResetByAdmin#123")).body;
      expect(session.user.mustChangePassword).toBe(true);
      expect((await get("/leads", session.accessToken)).status).toBe(403);
    });
  });

  describe("two-step login", () => {
    const email = "twostep@example.com";
    const password = "TwoStepPass#12345";
    let token: string;
    let userId: string;
    let secret: string;

    beforeAll(async () => {
      userId = (await post("/team", admin, { name: "Two Step", email, role: "MANAGER", password })).body.id;
      let s = (await login(email, password)).body;
      await post("/auth/change-password", s.accessToken, { currentPassword: password, newPassword: `${password}!` });
      s = (await login(email, `${password}!`)).body;
      token = s.accessToken;
    });

    it("cannot be switched on with a wrong code", async () => {
      secret = (await post("/auth/2fa/setup", token)).body.secret;
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect((await post("/auth/2fa/enable", token, { code: "000000" })).status).toBe(400);
      expect((await login(email, `${password}!`)).body.accessToken).toBeTruthy(); // still not required
    });

    it("once on, a password alone no longer signs in", async () => {
      expect((await post("/auth/2fa/enable", token, { code: code(secret) })).status).toBe(201);
      const res = await login(email, `${password}!`);
      expect(res.body.twoFactorRequired).toBe(true);
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.challengeToken).toBeTruthy();
    });

    it("the challenge token is good for nothing but finishing the sign-in", async () => {
      const { challengeToken } = (await login(email, `${password}!`)).body;
      expect((await get("/leads", challengeToken)).status).toBe(401);
      expect((await get("/auth/me", challengeToken)).status).toBe(401);
    });

    it("rejects a wrong code and accepts the right one", async () => {
      const { challengeToken } = (await login(email, `${password}!`)).body;
      expect((await post("/auth/2fa/verify", undefined, { challengeToken, code: "000000" })).status).toBe(401);
      const ok = await post("/auth/2fa/verify", undefined, { challengeToken, code: code(secret) });
      expect(ok.status).toBe(201);
      expect((await get("/leads", ok.body.accessToken)).status).toBe(200);
      expect((await get("/auth/me", ok.body.accessToken)).body.twoFactorEnabled).toBe(true);
    });

    it("a made-up challenge token is refused", async () => {
      expect((await post("/auth/2fa/verify", undefined, { challengeToken: "abc.def.ghi", code: "123456" })).status).toBe(401);
    });

    it("an admin can reset a lost phone, after which the password signs in again", async () => {
      expect((await post(`/team/${userId}/reset-2fa`, admin)).status).toBe(201);
      expect((await login(email, `${password}!`)).body.accessToken).toBeTruthy();
    });

    it("turning it off needs both the password and a live code", async () => {
      const s = (await login(email, `${password}!`)).body.accessToken;
      secret = (await post("/auth/2fa/setup", s)).body.secret;
      await post("/auth/2fa/enable", s, { code: code(secret) });
      expect((await post("/auth/2fa/disable", s, { password: "wrong-password-1", code: code(secret) })).status).toBe(400);
      expect((await post("/auth/2fa/disable", s, { password: `${password}!`, code: "000000" })).status).toBe(400);
      expect((await post("/auth/2fa/disable", s, { password: `${password}!`, code: code(secret) })).status).toBe(201);
      expect((await login(email, `${password}!`)).body.accessToken).toBeTruthy();
    });
  });
});
