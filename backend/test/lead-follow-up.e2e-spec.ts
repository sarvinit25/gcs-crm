import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

/** The optional second form on a loan page adds to the same lead. */
describe("website follow-up details", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const lead = async (id: string) => (await http.get(`${API}/leads/${id}`).set({ Authorization: `Bearer ${admin}` })).body;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("hands back a pass with the enquiry, and the pass adds the extra answers to that same lead", async () => {
    const first = await http.post(`${API}/public/leads`).send({ name: "Followup Probe", phone: "9811950001", source: "service-enquiry-home-loan", productSlug: "home-loan", amount: 4500000, detail: "Loan type: Home Loan" });
    expect(first.status).toBe(201);
    expect(first.body.followUpToken).toEqual(expect.any(String));

    const more = await http.post(`${API}/public/leads/${first.body.id}/details`).send({ token: first.body.followUpToken, detail: "Detailed assessment\nMonthly take-home salary: ₹1,00,000", employmentType: "SALARIED", monthlyIncome: 100000 });
    expect(more.status).toBe(201);
    const l = await lead(first.body.id);
    expect(l.notes).toContain("Loan type: Home Loan");
    expect(l.notes).toContain("More details from the website");
    expect(l.notes).toContain("Monthly take-home salary");
    expect(l).toMatchObject({ employmentType: "SALARIED" });
    expect(Number(l.monthlyIncome)).toBe(100000);

    // Sending it twice adds nothing more, and there is still one lead.
    await http.post(`${API}/public/leads/${first.body.id}/details`).send({ token: first.body.followUpToken, detail: "Detailed assessment\nMonthly take-home salary: ₹1,00,000" });
    expect(((await lead(first.body.id)).notes.match(/More details from the website/g) ?? []).length).toBe(1);
    const found = (await http.get(`${API}/leads?search=Followup%20Probe`).set({ Authorization: `Bearer ${admin}` })).body.items;
    expect(found).toHaveLength(1);
  });

  it("does not overwrite income staff already set, and refuses a wrong pass or someone else's lead", async () => {
    const a = await http.post(`${API}/public/leads`).send({ name: "Followup Two", phone: "9811950002", source: "service-enquiry-home-loan" });
    await http.patch(`${API}/leads/${a.body.id}`).set({ Authorization: `Bearer ${admin}` }).send({ monthlyIncome: 50000 });
    await http.post(`${API}/public/leads/${a.body.id}/details`).send({ token: a.body.followUpToken, detail: "Detailed assessment\nx", monthlyIncome: 99000 });
    expect(Number((await lead(a.body.id)).monthlyIncome)).toBe(50000);

    const b = await http.post(`${API}/public/leads`).send({ name: "Followup Three", phone: "9811950003", source: "service-enquiry-home-loan" });
    expect((await http.post(`${API}/public/leads/${b.body.id}/details`).send({ token: a.body.followUpToken, detail: "Not yours, trying" })).status).toBe(403);
    expect((await http.post(`${API}/public/leads/${b.body.id}/details`).send({ token: "99999999999999.forgedforgedforged", detail: "Forged pass" })).status).toBe(403);
    expect((await lead(b.body.id)).notes ?? "").not.toContain("Not yours");
  });
});
