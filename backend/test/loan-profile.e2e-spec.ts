/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };
const STAFF = { email: "profile.staff.e2e@example.com", password: "StaffPass#12345", phone: "9000099901" };

/** The Customer Loan Profile on a lead: staff and the telecaller answer through the same reader as WhatsApp. */
describe("loan profile on a lead", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let staff: string;
  let leadId: string;
  let theirs: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(t ? as(t) : {}).send(body);
  const get = (path: string, t: string) => http.get(`${API}${path}`).set(as(t));

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await post("/auth/login", undefined, ADMIN)).body.accessToken;
    const made = await post("/team", admin, { name: "Profile Staff", email: STAFF.email, phone: STAFF.phone, role: "ADVISOR", password: STAFF.password });
    staff = await signIn(post, STAFF.email, STAFF.password);
    leadId = (await post("/leads", admin, { name: "Profile Mine", phone: "9000099902", source: "e2e", assignedOfficerId: made.body.id })).body.id;
    theirs = (await post("/leads", admin, { name: "Profile Theirs", phone: "9000099903", source: "e2e" })).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("starts with the first mandatory question", async () => {
    const res = await get(`/leads/${leadId}/loan-profile`, staff);
    expect(res.status).toBe(200);
    expect(res.body.next).toMatchObject({ key: "loan-product", kind: "choice" });
    expect(res.body.progress.done).toBe(0);
  });

  it("stores a valid answer as the allowed value, and moves on", async () => {
    const res = await post(`/leads/${leadId}/loan-profile/answer`, staff, { reply: "home loan", key: "loan-product" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ accepted: true, stored: "Home Loan (HL)", nextKey: "loan-amount" });
    const money = await post(`/leads/${leadId}/loan-profile/answer`, staff, { reply: "50 lakh" });
    expect(money.body.stored).toBe("5000000");
    const view = (await get(`/leads/${leadId}/loan-profile`, staff)).body;
    expect(view.answers.map((a: any) => a.value)).toEqual(["Home Loan (HL)", "₹50,00,000"]);
  });

  it("does not store a reply it cannot read, and asks again", async () => {
    const res = await post(`/leads/${leadId}/loan-profile/answer`, staff, { reply: "banana" });
    expect(res.body.accepted).toBe(false);
    expect(res.body.nextKey).toBe("purpose");
    expect((await get(`/leads/${leadId}/loan-profile`, staff)).body.progress.done).toBe(2);
  });

  it("refuses unknown fields and leaves other people's leads alone", async () => {
    expect((await post(`/leads/${leadId}/loan-profile/answer`, staff, { reply: "x", extra: 1 })).status).toBe(400);
    expect((await get(`/leads/${theirs}/loan-profile`, staff)).status).toBe(404);
    expect((await post(`/leads/${theirs}/loan-profile/answer`, staff, { reply: "Home Loan" })).status).toBe(404);
    expect((await get(`/leads/${leadId}/loan-profile`, undefined as never)).status).toBe(401);
  });
});
