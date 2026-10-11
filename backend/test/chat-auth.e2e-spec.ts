/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { PrismaService } from "../src/prisma/prisma.service";
import { OtpSenderService } from "../src/chat-auth/otp-sender.service";

const API = "/crm/api";

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
    expect(ok.body).toEqual({ valid: true, name: "Asha Rao" });
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

  it("stops a pass working once it has expired", async () => {
    const p = phone();
    await send(p);
    const { token } = (await verify(p, lastCode(p))).body;
    await prisma.chatSession.updateMany({ where: { phone: p }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await post("/public/chat-auth/session", { token })).body).toEqual({ valid: false });
  });
});
