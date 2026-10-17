/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { PrismaService } from "../src/prisma/prisma.service";
import { OtpSenderService } from "../src/chat-auth/otp-sender.service";

const API = "/crm/api";
// Set before the app starts: this number is a test number with a fixed code.
process.env["CHAT_OTP_TEST_PHONES"] = "9888800001";
process.env["CHAT_OTP_TEST_CODE"] = "246810";

/** The website chat opens only after a code sent to the visitor's mobile, and the person lands in the CRM. */
describe("chat sign-in", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let sender: OtpSenderService;
  let sent: { phone: string; code: string }[] = [];
  let deliver = true;
  let n = 0;
  const phone = () => `9${String(77000000 + ++n).padStart(9, "0")}`;

  const post = (path: string, body: object = {}, t?: string) =>
    http.post(`${API}${path}`).set(t ? { Authorization: `Bearer ${t}` } : {}).send(body);
  const send = (p: string, name = "Chat Tester") => post("/public/chat-auth/send", { name, phone: p });
  const verify = (p: string, code: string) => post("/public/chat-auth/verify", { phone: p, code });
  const lastCode = (p: string) => [...sent].reverse().find((s) => s.phone === p)!.code;
  const wrong = (code: string) => (code === "123456" ? "654321" : "123456");
  /** Lets the resend cooldown pass without waiting for it. */
  const cooled = (p: string) =>
    prisma.chatOtp.updateMany({ where: { phone: p }, data: { createdAt: new Date(Date.now() - 60_000) } });

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    sender = app.get(OtpSenderService);
    jest.spyOn(sender, "send").mockImplementation(async (p, code) => {
      if (!deliver) return false;
      sent.push({ phone: p, code });
      return true;
    });
    admin = (await post("/auth/login", { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
  });

  beforeEach(() => {
    deliver = true;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("sends a six-digit code and keeps only a hash of it", async () => {
    const p = phone();
    const res = await send(p);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ sent: true, resendAfterSeconds: 30 });
    expect(JSON.stringify(res.body)).not.toContain(lastCode(p));
    expect(lastCode(p)).toMatch(/^\d{6}$/);
    const row = await prisma.chatOtp.findFirstOrThrow({ where: { phone: p } });
    expect(row.codeHash).not.toContain(lastCode(p));
    expect(row.codeHash).toHaveLength(64);
  });

  it("a test number gets the fixed code and no SMS, while other numbers are unaffected", async () => {
    const test = "9888800001";
    const before = sent.length;
    expect((await send(test, "Test User")).status).toBe(201);
    expect(sent.length).toBe(before);
    const wrongTry = await verify(test, "111111");
    expect(wrongTry.status).toBe(400);
    const ok = await verify(test, "246810");
    expect(ok.status).toBe(201);
    expect(ok.body.name).toBe("Test User");

    const other = phone();
    await send(other);
    expect(sent.length).toBe(before + 1);
    expect(lastCode(other)).not.toBe("246810");
    expect((await verify(other, "246810")).status).toBe(400);
  });

  it("rejects a number that is not an Indian mobile, and a missing name", async () => {
    expect((await send("12345")).status).toBe(400);
    expect((await post("/public/chat-auth/send", { name: "A", phone: phone() })).status).toBe(400);
  });

  it("signs the visitor in with the right code, and gives a pass the website can check", async () => {
    const p = phone();
    await send(p, "Asha Rao");
    const res = await verify(p, lastCode(p));
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Asha Rao");
    expect(res.body.token.length).toBeGreaterThan(30);

    const ok = await post("/public/chat-auth/session", { token: res.body.token });
    expect(ok.body).toEqual({ valid: true, name: "Asha Rao", blockedUntil: null });
    expect((await post("/public/chat-auth/session", { token: "x".repeat(43) })).body).toEqual({ valid: false });

    const stored = await prisma.chatSession.findFirstOrThrow({ where: { phone: p } });
    expect(stored.tokenHash).not.toBe(res.body.token);
  });

  it("puts the number in the CRM as a chatbot contact", async () => {
    const p = phone();
    await send(p, "Meera Shah");
    await verify(p, lastCode(p));
    const lead = await prisma.lead.findFirstOrThrow({ where: { phone: p } });
    expect(lead.source).toBe("website-chat");
    expect(lead.chatVerifiedAt).not.toBeNull();

    const list = await http.get(`${API}/leads?chatbot=true&search=${p}`).set({ Authorization: `Bearer ${admin}` });
    expect(list.body.items.map((l: any) => l.id)).toContain(lead.id);
    const other = await http.get(`${API}/leads?chatbot=true&pageSize=100`).set({ Authorization: `Bearer ${admin}` });
    expect(other.body.items.every((l: any) => l.chatVerifiedAt)).toBe(true);
    const counts = await http.get(`${API}/leads/segments`).set({ Authorization: `Bearer ${admin}` });
    expect(counts.body.chatbot).toBeGreaterThan(0);
  });

  it("marks an existing lead as a chatbot contact instead of adding a second one", async () => {
    const p = phone();
    await post("/public/leads", { name: "Ravi Kulkarni", phone: p, source: "contact-form", city: "Pune" });
    await send(p, "Ravi Kulkarni");
    await verify(p, lastCode(p));
    const leads = await prisma.lead.findMany({ where: { phone: p } });
    expect(leads).toHaveLength(1);
    expect(leads[0]!.source).toBe("contact-form");
    expect(leads[0]!.chatVerifiedAt).not.toBeNull();
  });

  it("refuses a wrong code, counts the tries, and kills the code after five", async () => {
    const p = phone();
    await send(p);
    const code = lastCode(p);
    const first = await verify(p, wrong(code));
    expect(first.status).toBe(400);
    expect(first.body.message).toContain("4 tries left");
    for (let i = 0; i < 4; i++) await verify(p, wrong(code));
    // even the right code is dead now
    const late = await verify(p, code);
    expect(late.status).toBe(400);
    expect(await prisma.chatSession.count({ where: { phone: p } })).toBe(0);
  });

  it("uses a code once", async () => {
    const p = phone();
    await send(p);
    const code = lastCode(p);
    expect((await verify(p, code)).status).toBe(201);
    expect((await verify(p, code)).status).toBe(400);
  });

  it("lets only the newest code work", async () => {
    const p = phone();
    await send(p);
    const older = lastCode(p);
    await cooled(p);
    await send(p);
    const newer = lastCode(p);
    expect(older).not.toBe(newer);
    expect((await verify(p, older)).status).toBe(400);
    expect((await verify(p, newer)).status).toBe(201);
  });

  it("refuses an expired code", async () => {
    const p = phone();
    await send(p);
    await prisma.chatOtp.updateMany({ where: { phone: p }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await verify(p, lastCode(p));
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("expired");
  });

  it("holds back a second code for the same number until the pause is over", async () => {
    const p = phone();
    expect((await send(p)).status).toBe(201);
    expect((await send(p)).status).toBe(429);
  });

  it("caps codes per number per hour", async () => {
    const p = phone();
    for (let i = 0; i < 5; i++) {
      expect((await send(p)).status).toBe(201);
      await cooled(p);
    }
    const sixth = await send(p);
    expect(sixth.status).toBe(429);
    expect(sixth.body.message).toContain("hour");
  });

  it("says so when the code could not be delivered, and does not leave a usable code", async () => {
    const p = phone();
    deliver = false;
    const res = await send(p);
    expect(res.status).toBe(503);
    expect(await prisma.chatOtp.count({ where: { phone: p, usedAt: null } })).toBe(0);
  });

  it("ends a pass on request", async () => {
    const p = phone();
    await send(p);
    const { token } = (await verify(p, lastCode(p))).body;
    await post("/public/chat-auth/end", { token });
    expect((await post("/public/chat-auth/session", { token })).body).toEqual({ valid: false });
  });

  describe("off-topic strikes", () => {
    const signedIn = async () => {
      const p = phone();
      await send(p);
      return { p, token: (await verify(p, lastCode(p))).body.token as string };
    };
    const strike = (token: string) => post("/public/chat-auth/strike", { token });

    it("counts each off-topic message and pauses the chat on the third", async () => {
      const { token } = await signedIn();
      const first = await strike(token);
      expect(first.body).toMatchObject({ valid: true, strikes: 1, left: 2, blockedUntil: null });
      expect((await strike(token)).body).toMatchObject({ strikes: 2, left: 1, blockedUntil: null });

      const third = await strike(token);
      expect(third.body).toMatchObject({ strikes: 3, left: 0 });
      const until = new Date(third.body.blockedUntil).getTime();
      expect(until).toBeGreaterThan(Date.now() + 55 * 60_000);

      const check = await post("/public/chat-auth/session", { token });
      expect(check.body).toMatchObject({ valid: true, blockedUntil: third.body.blockedUntil });
    });

    it("does not extend a pause that is already running", async () => {
      const { token } = await signedIn();
      await strike(token);
      await strike(token);
      const blocked = (await strike(token)).body;
      const again = (await strike(token)).body;
      expect(again.blockedUntil).toBe(blocked.blockedUntil);
      expect(again.strikes).toBe(3);
    });

    it("keeps the count when the same number signs in again", async () => {
      const { p, token } = await signedIn();
      await strike(token);
      await strike(token);
      await cooled(p);
      await send(p);
      const fresh = (await verify(p, lastCode(p))).body.token;
      expect((await strike(fresh)).body).toMatchObject({ strikes: 3, left: 0 });
      expect((await post("/public/chat-auth/session", { token: fresh })).body.blockedUntil).not.toBeNull();
    });

    it("starts again once the pause is over", async () => {
      const { p, token } = await signedIn();
      await strike(token);
      await strike(token);
      await strike(token);
      await prisma.chatStrike.update({ where: { phone: p }, data: { blockedUntil: new Date(Date.now() - 1000) } });
      expect((await post("/public/chat-auth/session", { token })).body.blockedUntil).toBeNull();
      expect((await strike(token)).body).toMatchObject({ strikes: 1, left: 2, blockedUntil: null });
    });

    it("forgets a lone strike after a few quiet hours", async () => {
      const { p, token } = await signedIn();
      await strike(token);
      await strike(token);
      await prisma.chatStrike.update({ where: { phone: p }, data: { lastStrikeAt: new Date(Date.now() - 7 * 3_600_000) } });
      expect((await strike(token)).body).toMatchObject({ strikes: 1, left: 2 });
    });

    it("ignores a pass that is not valid", async () => {
      expect((await strike("x".repeat(43))).body).toEqual({ valid: false });
    });
  });

  it("stops a pass working once it has expired", async () => {
    const p = phone();
    await send(p);
    const { token } = (await verify(p, lastCode(p))).body;
    await prisma.chatSession.updateMany({ where: { phone: p }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await post("/public/chat-auth/session", { token })).body).toEqual({ valid: false });
  });
});
