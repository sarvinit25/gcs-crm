import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

/** The extra details a lender asks for, kept on the lead and carried onto the applicant. */
describe("lead profile", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (p: string) => http.get(`${API}${p}`).set(as(admin));
  const send = (m: "post" | "patch", p: string, body: object = {}) => http[m](`${API}${p}`).set(as(admin)).send(body);

  let id: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
    id = (await send("post", "/leads", { name: "Profile Probe", phone: "9811600001", source: "manual-entry" })).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("keeps contact, applicant, employment and address details, tidying PAN to capitals", async () => {
    const res = await send("patch", `/leads/${id}`, {
      secondaryPhone: "9811600002",
      dateOfBirth: "1990-05-17",
      pan: "abcde1234f",
      address: "Flat 12, Link Road",
      city: "Mumbai",
      pincode: "400084",
      employmentType: "SALARIED",
      employerName: "Acme Corp",
      designation: "Manager",
      experienceYears: 7.5,
      monthlyIncome: 95000,
      workLocation: "BKC",
      officialEmail: "Rohit@Acme.com",
      amount: 1900000,
    });
    expect(res.status).toBe(200);
    const lead = (await get(`/leads/${id}`)).body;
    expect(lead).toMatchObject({ secondaryPhone: "9811600002", pan: "ABCDE1234F", pincode: "400084", employerName: "Acme Corp", designation: "Manager", workLocation: "BKC", officialEmail: "rohit@acme.com" });
    expect(lead.dateOfBirth.slice(0, 10)).toBe("1990-05-17");
    expect(Number(lead.experienceYears)).toBe(7.5);
  });

  it("clears a detail when its box is emptied, and refuses malformed ones", async () => {
    const cleared = await send("patch", `/leads/${id}`, { designation: "  ", dateOfBirth: null, amount: null, monthlyIncome: null, employmentType: null });
    expect(cleared.status).toBe(200);
    const lead = (await get(`/leads/${id}`)).body;
    expect(lead).toMatchObject({ designation: null, dateOfBirth: null, amount: null, monthlyIncome: null, employmentType: null });
    for (const bad of [{ pan: "123" }, { pincode: "40008" }, { secondaryPhone: "12345" }, { officialEmail: "nope" }, { experienceYears: 90 }]) {
      expect((await send("patch", `/leads/${id}`, bad)).status).toBe(400);
    }
  });

  it("masks the PAN in the audit log", async () => {
    await send("patch", `/leads/${id}`, { pan: "ZZZZZ9999Z" });
    const log = JSON.stringify((await get(`/audit?entity=Lead&entityId=${id}&pageSize=50`)).body);
    expect(log).toContain("••••999Z");
    expect(log).not.toContain("ZZZZZ9999Z");
    expect(log).not.toContain("ABCDE1234F");
  });

  it("carries the details onto the applicant when a file is raised from the lead", async () => {
    await send("patch", `/leads/${id}`, { dateOfBirth: "1990-05-17", pan: "ABCDE1234F", employmentType: "SALARIED", employerName: "Acme Corp", monthlyIncome: 95000, address: "Flat 12, Link Road", pincode: "400084" });
    const product = ((await get("/loan-products")).body as { id: string }[])[0].id;
    const file = await send("post", "/applications", { leadId: id, loanProductId: product, requestedAmount: 1900000 });
    expect(file.status).toBe(201);
    const applicant = (await get(`/applications/${file.body.id}`)).body.applicants[0];
    expect(applicant).toMatchObject({ name: "Profile Probe", pan: "ABCDE1234F", employerName: "Acme Corp", employmentType: "SALARIED", pincode: "400084", address: "Flat 12, Link Road" });
    expect(applicant.dateOfBirth.slice(0, 10)).toBe("1990-05-17");
    expect(Number(applicant.monthlyIncome)).toBe(95000);
  });
});
