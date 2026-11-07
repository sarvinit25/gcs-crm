/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { PrismaService } from "../src/prisma/prisma.service";

const API = "/crm/api";
process.env["CHAT_OTP_TEST_PHONES"] = "9888800002";
process.env["CHAT_OTP_TEST_CODE"] = "246810";

/** The website assistant (Gia) fills the loan profile on the visitor's own lead, through their chat pass. */
describe("loan profile through the website chat", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let token: string;
  const post = (path: string, body: object = {}) => http.post(`${API}${path}`).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    await post("/public/chat-auth/send", { name: "Gia Profile Tester", phone: "9888800002" });
    token = (await post("/public/chat-auth/verify", { phone: "9888800002", code: "246810" })).body.token;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("asks the first mandatory question for the visitor's lead", async () => {
    const res = await post("/public/chat-auth/profile/next", { token });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ available: true, key: "loan-product" });
    expect(res.body.question).toContain("Home Loan (HL)");
  });

  it("stores only what the form accepts, from the visitor's own words", async () => {
    const ok = await post("/public/chat-auth/profile/answer", { token, reply: "home loan please" });
    expect(ok.body).toMatchObject({ accepted: true, stored: "Home Loan (HL)", nextKey: "loan-amount" });
    const bad = await post("/public/chat-auth/profile/answer", { token, reply: "lots" });
    expect(bad.body.accepted).toBe(false);
    expect(bad.body.nextKey).toBe("loan-amount");
    const amount = await post("/public/chat-auth/profile/answer", { token, reply: "45 lakh" });
    expect(amount.body.stored).toBe("4500000");
    const lead = await prisma.lead.findFirstOrThrow({ where: { phone: "9888800002" } });
    const rows = await prisma.leadAnswer.findMany({ where: { leadId: lead.id, key: { startsWith: "lp-" } } });
    expect(rows.map((r) => r.value).sort()).toEqual(["4500000", "Home Loan (HL)"]);
  });

  it("does nothing for a pass that is not valid", async () => {
    const res = await post("/public/chat-auth/profile/answer", { token: "x".repeat(43), reply: "Home Loan" });
    expect(res.body).toEqual({ available: false });
    expect((await post("/public/chat-auth/profile/next", { token: "short" })).status).toBe(400);
  });
});
