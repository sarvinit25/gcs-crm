import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };

type Check = { key: string; status: string; detail: string };

/** Assessing a file: the checks, the numbers, the existing loans, and clearing or rejecting it. */
describe("credit evaluation", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let staff: string;
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const url = (id: string, p = "") => `/applications/${id}/credit-evaluation${p}`;
  const get = (p: string, t = admin) => http.get(`${API}${p}`).set(as(t));
  const send = (m: "post" | "put" | "patch" | "delete", p: string, body: object = {}, t = admin) => http[m](`${API}${p}`).set(as(t)).send(body);
  const check = (view: { checks: Check[] }, key: string) => view.checks.find((c) => c.key === key)!;

  let fileId: string;
  let bareId: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await http.post(`${API}/auth/login`).send(ADMIN)).body.accessToken;
    const email = "evaluation.staff@example.com";
    const advisor = (await send("post", "/team", { name: "Evaluation Staff", email, phone: "9000066662", role: "ADVISOR", password: "StaffPass#12345" })).body.id;
    staff = await signIn((path, token, body) => http.post(`${API}${path}`).set(token ? as(token) : {}).send(body), email, "StaffPass#12345");
    const products = (await get("/loan-types")).body as { id: string; slug: string }[];
    const lap = products.find((p) => p.slug === "loan-against-property")!.id;
    const personal = products.find((p) => p.slug === "personal-loan")!.id;
    fileId = (
      await send("post", "/applications", {
        loanProductId: lap,
        requestedAmount: 4_000_000,
        tenureMonths: 120,
        ownerId: advisor,
        applicants: [{ name: "Eval Probe", isPrimary: true, phone: "9811900001", pan: "ABCDE1234F", employmentType: "SELF_EMPLOYED", monthlyIncome: 200000, cibilScore: 760 }],
      })
    ).body.id;
    bareId = (await send("post", "/applications", { loanProductId: personal, requestedAmount: 300000, applicants: [{ name: "Bare Probe", isPrimary: true, phone: "9811900002" }] })).body.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("reads a file as a business case on a secured loan, and flags what is missing", async () => {
    const view = (await get(url(bareId))).body;
    expect(view).toMatchObject({ profile: "OTHER", secured: false });
    expect(check(view, "pan").status).toBe("FAIL");
    expect(check(view, "cibil").status).toBe("UNKNOWN");
    expect(check(view, "foir").status).toBe("UNKNOWN");
    expect(view.checks.map((c: Check) => c.key)).not.toContain("ltv");

    const big = (await get(url(fileId))).body;
    expect(big).toMatchObject({ profile: "BUSINESS", secured: true, loanProduct: "Loan Against Property" });
    expect(big.checks.map((c: Check) => c.key)).toEqual(expect.arrayContaining(["dscr", "bto", "gst", "ltv"]));
    expect(check(big, "pan").status).toBe("OK");
    expect(check(big, "cibil").status).toBe("OK");
  });

  it("works out EMI, FOIR, DSCR, turnover mismatches and LTV from what is entered", async () => {
    const res = await send("put", url(fileId), {
      proposedRate: 10,
      annualTurnover: 12_000_000,
      netProfit: 2_000_000,
      depreciation: 200_000,
      interestPaid: 100_000,
      avgMonthlyBankCredits: 700_000,
      gstAnnualTurnover: 11_500_000,
      propertyValue: 6_000_000,
    });
    expect(res.status).toBe(200);
    const r = res.body.results;
    expect(r.proposedEmi).toBeGreaterThan(50_000);
    expect(r.proposedEmi).toBeLessThan(55_000);
    expect(r.income).toMatchObject({ monthly: 200000, source: "applicants" });
    expect(r.foir.value).toBeLessThan(30);
    expect(check(res.body, "foir").status).toBe("OK");
    expect(r.dscr.value).toBeGreaterThan(3);
    expect(check(res.body, "dscr").status).toBe("OK");
    expect(r.bto.annual).toBe(8_400_000);
    expect(r.bto.variancePercent).toBe(-30);
    expect(check(res.body, "bto").status).toBe("WATCH");
    expect(check(res.body, "gst").status).toBe("OK");
    expect(r.ltv.value).toBeCloseTo(66.7, 1);
    expect(check(res.body, "ltv").status).toBe("OK");
  });

  it("counts existing EMIs against income, but not a loan that will be closed first", async () => {
    const added = await send("post", url(fileId, "/loans"), { lenderName: "HDFC Bank", loanType: "Car loan", emi: 40000, outstanding: 900000, monthsLeft: 30 });
    expect(added.status).toBe(201);
    await send("post", url(fileId, "/loans"), { lenderName: "ICICI Bank", loanType: "Credit card", emi: 15000, counted: false });
    let view = (await get(url(fileId))).body;
    expect(view.existingLoans).toHaveLength(2);
    expect(view.results.existingEmi).toBe(40000);
    const withLoan = view.results.foir.value;

    const second = view.existingLoans.find((l: { lenderName: string }) => l.lenderName === "ICICI Bank");
    view = (await send("patch", url(fileId, `/loans/${second.id}`), { counted: true })).body;
    expect(view.results.existingEmi).toBe(55000);
    expect(view.results.foir.value).toBeGreaterThan(withLoan);
    view = (await send("delete", url(fileId, `/loans/${second.id}`))).body;
    expect(view.existingLoans).toHaveLength(1);
    expect((await send("post", url(fileId, "/loans"), { lenderName: "X Bank", emi: 1000, applicantId: "nobody" })).status).toBe(400);
  });

  it("flags a FOIR over the ceiling and an LTV over the ceiling", async () => {
    const res = await send("put", url(fileId), { monthlyIncome: 90000, propertyValue: 4_200_000 });
    expect(check(res.body, "foir").status).toBe("FAIL");
    expect(check(res.body, "ltv").status).toBe("FAIL");
    expect(res.body.results.foir.eligibleAmount).toBeGreaterThanOrEqual(0);
  });

  it("will not clear a file with a failed check unless the risk is acknowledged, then moves it on", async () => {
    const blocked = await send("post", url(fileId, "/decision"), { decision: "READY" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/Still failing: .*FOIR/);
    const ok = await send("post", url(fileId, "/decision"), { decision: "READY", acknowledgeRisks: true, note: "Cleared by me" });
    expect(ok.status).toBe(201);
    expect(ok.body.decision).toMatchObject({ decision: "READY", by: "GCS Admin" });
    expect(ok.body.application.status).toBe("SUBMITTED");
  });

  it("rejecting needs a reason, and moves the file to Rejected", async () => {
    expect((await send("post", url(bareId, "/decision"), { decision: "REJECTED" })).status).toBe(400);
    const res = await send("post", url(bareId, "/decision"), { decision: "REJECTED", note: "No PAN and no income proof" });
    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe("REJECTED");
    expect(res.body.decision.note).toBe("No PAN and no income proof");
    // A rejected file cannot simply be cleared.
    expect((await send("post", url(bareId, "/decision"), { decision: "READY", acknowledgeRisks: true })).status).toBe(400);
  });

  it("lets an advisor work the numbers on their own file, but not clear or reject it, and not see other files", async () => {
    expect((await get(url(fileId), staff)).status).toBe(200);
    expect((await send("put", url(fileId), { remarks: "Waiting for ITR" }, staff)).status).toBe(200);
    expect((await send("post", url(fileId, "/decision"), { decision: "READY", acknowledgeRisks: true }, staff)).status).toBe(403);
    expect((await get(url(bareId), staff)).status).toBe(404);
  });
});
