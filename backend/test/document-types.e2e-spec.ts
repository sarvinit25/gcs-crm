import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

type DocType = { id: string; name: string; category: string; applicantTypes: string[]; loanProducts: { id: string; name: string }[]; active: boolean; code: string | null };

/** The admin-managed list of documents a case can need, and what the checklist makes of it. */
describe("document types", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (p: string, t?: string) => http.get(`${API}${p}`).set(t ? as(t) : {});
  const send = (m: "post" | "patch" | "delete", p: string, t: string, body: object = {}) => http[m](`${API}${p}`).set(as(t)).send(body);
  const loanTypeId = async (slug: string) => ((await get("/loan-types", admin)).body as { id: string; slug: string }[]).find((t) => t.slug === slug)!.id;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("starts with the old checklist as one document per name, applying to everyone unless narrowed", async () => {
    const res = await get("/document-types", admin);
    expect(res.status).toBe(200);
    const all = res.body as DocType[];
    const pan = all.find((d) => d.name === "PAN card")!;
    expect(pan).toMatchObject({ category: "KYC", applicantTypes: [], loanProducts: [] });
    const slips = all.find((d) => d.name === "Latest 3 months' salary slips")!;
    expect(slips.applicantTypes).toEqual(["SALARIED"]);
    const quote = all.find((d) => d.name === "Vehicle quotation from dealer")!;
    expect(quote.loanProducts.map((p) => p.name).sort()).toEqual(["New Car Loan", "Used Car Loan"]);
    expect((await get("/document-types/categories", admin)).body).toContain("KYC");
  });

  it("lists one real document per row: no pasted page text, and no document listed twice", async () => {
    const all = (await get("/document-types", admin)).body as DocType[];
    expect(all.filter((d) => d.name.length > 140)).toEqual([]);
    expect(all.filter((d) => /Send clear photos|Ready when you are|Fast money|\[ \]/.test(d.name))).toEqual([]);
    const seen = new Set<string>();
    const twice = all.filter((d) => (seen.has(d.name) ? true : (seen.add(d.name), false))).map((d) => d.name);
    expect(twice).toEqual([]);
  });

  it("adds, edits and deletes a document type with its loan types and applicant profiles", async () => {
    const hl = await loanTypeId("home-loan");
    const lap = await loanTypeId("loan-against-property");
    const made = await send("post", "/document-types", admin, {
      name: "Test valuation report",
      category: "Property papers",
      code: "tval",
      description: "From the bank's approved valuer",
      loanProductIds: [hl],
      applicantTypes: ["SALARIED", "PROPRIETORSHIP"],
    });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ code: "TVAL", active: true });
    expect(made.body.loanProducts).toHaveLength(1);

    const edited = await send("patch", `/document-types/${made.body.id}`, admin, { loanProductIds: [hl, lap], applicantTypes: [] });
    expect(edited.body.loanProducts).toHaveLength(2);
    expect(edited.body.applicantTypes).toEqual([]);

    expect((await send("delete", `/document-types/${made.body.id}`, admin)).status).toBe(200);
    expect(((await get("/document-types", admin)).body as DocType[]).some((d) => d.id === made.body.id)).toBe(false);
  });

  it("refuses a duplicate, an unknown category and an unknown loan type", async () => {
    expect((await send("post", "/document-types", admin, { name: "PAN card", category: "KYC" })).status).toBe(409);
    expect((await send("post", "/document-types", admin, { name: "Odd one", category: "Nonsense" })).status).toBe(400);
    expect((await send("post", "/document-types", admin, { name: "Odd two", category: "KYC", loanProductIds: ["nope"] })).status).toBe(400);
    expect((await send("post", "/document-types", admin, { name: "Odd three", category: "KYC", applicantTypes: ["ALIEN"] })).status).toBe(400);
  });

  it("feeds the application checklist: only documents for that loan type and profile, and not switched-off ones", async () => {
    const car = await loanTypeId("new-car-loan");
    const made = await send("post", "/document-types", admin, { name: "Probe-only document", category: "KYC", loanProductIds: [car], applicantTypes: ["SALARIED"] });
    const file = await send("post", "/applications", admin, {
      loanProductId: car,
      requestedAmount: 500000,
      applicants: [{ name: "Checklist Probe", isPrimary: true, phone: "9811100002", employmentType: "SALARIED" }],
    });
    expect(file.status).toBe(201);
    const names = async () => ((await get(`/applications/${file.body.id}/checklist`, admin)).body.items as { label: string }[]).map((i) => i.label);
    expect(await names()).toContain("Probe-only document");
    await send("patch", `/document-types/${made.body.id}`, admin, { active: false });
    expect(await names()).not.toContain("Probe-only document");
    await send("delete", `/document-types/${made.body.id}`, admin);

    // The same document does not reach a home loan file, or a salaried-only one for a business applicant.
    const other = await send("post", "/applications", admin, {
      loanProductId: await loanTypeId("home-loan"),
      requestedAmount: 2500000,
      applicants: [{ name: "Checklist Other", isPrimary: true, phone: "9811100003", employmentType: "SELF_EMPLOYED", constitution: "PARTNERSHIP" }],
    });
    const otherNames = ((await get(`/applications/${other.body.id}/checklist`, admin)).body.items as { label: string }[]).map((i) => i.label);
    expect(otherNames).not.toContain("Vehicle quotation from dealer");
    expect(otherNames).not.toContain("Latest 3 months' salary slips");
    expect(otherNames).toContain("Registered partnership deed");
  });

  it("is for admins: staff cannot manage document types", async () => {
    const staffEmail = "doctypes.staff@example.com";
    await send("post", "/team", admin, { name: "Doc Staff", email: staffEmail, phone: "9000066657", role: "ADVISOR", password: "StaffPass#12345" });
    const staff = await signIn(
      (path, token, body) => http.post(`${API}${path}`).set(token ? as(token) : {}).send(body),
      staffEmail,
      "StaffPass#12345",
    );
    expect((await get("/document-types", staff)).status).toBe(403);
    expect((await send("post", "/document-types", staff, { name: "Nope", category: "KYC" })).status).toBe(403);
  });
});
