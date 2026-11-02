import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";

const API = "/crm/api";
const ADMIN = { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" };
const STAFF = { email: "money.staff.e2e@example.com", password: "StaffPass#12345", phone: "9000077701" };

/**
 * Sanction → disbursal → commission: the full money trail of one file — EMI
 * worked out for the lender's figures, net of deductions, and a commission that
 * goes due → claimed → received (in parts if the lender pays that way).
 */
describe("money trail", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let staff: string;
  let applicationId: string;
  let payoutId: string;
  let commissionId: string;
  let partnerId: string;

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token: string) => http.get(`${API}${path}`).set(as(token));
  const post = (path: string, token: string | undefined, body: object = {}) =>
    http.post(`${API}${path}`).set(token ? as(token) : {}).send(body);
  const put = (path: string, token: string, body: object) =>
    http.put(`${API}${path}`).set(as(token)).send(body);
  const patch = (path: string, token: string, body: object) =>
    http.patch(`${API}${path}`).set(as(token)).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    admin = (await post("/auth/login", undefined, ADMIN)).body.accessToken;

    const created = await post("/team", admin, {
      name: "Money Staff",
      email: STAFF.email,
      phone: STAFF.phone,
      role: "ADVISOR",
      password: STAFF.password,
    });
    staff = await signIn(post, STAFF.email, STAFF.password);

    partnerId = (
      await post("/partners", admin, { name: "Money Partner", phone: "9000077702", commissionRate: 20, password: "PartnerPass#1234" })
    ).body.id;

    const products = (await get("/loan-products", admin)).body as { id: string }[];
    const application = await post("/applications", admin, {
      loanProductId: products[0].id,
      requestedAmount: 1700000,
      ownerId: created.body.id,
      applicants: [{ name: "Karan Money", phone: "9000077703", isPrimary: true }],
    });
    applicationId = application.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("sanction", () => {
    it("numbers the sanction, works out the EMI and the percentage fee, and starts as pending", async () => {
      const res = await put(`/applications/${applicationId}/sanction`, admin, {
        financialStatus: "APPROVED",
        sanctionedAmount: 1700000,
        interestRate: 10.5,
        tenureMonths: 60,
        sanctionDate: "2026-07-24",
        bankRm: "Asha Rao",
        firstEmiDate: "2026-09-05",
        processingFeePercent: 1,
        commissionPercent: 0.9,
        notes: "Subject to valuation",
      });
      expect(res.status).toBe(200);
      expect(res.body.sanctionNo).toMatch(/^SN-.+-\d{5}$/);
      expect(Number(res.body.emiAmount)).toBe(36539.63);
      expect(Number(res.body.processingFee)).toBe(17000);
      expect(res.body.bankRm).toBe("Asha Rao");
      expect(res.body.disbursalStatus).toBe("PENDING");
      expect(res.body.drawn).toBe(0);
      expect(res.body.undrawn).toBe(1700000);
    });

    it("keeps the lender's own EMI when one is keyed in", async () => {
      const res = await put(`/applications/${applicationId}/sanction`, admin, {
        sanctionedAmount: 1700000,
        interestRate: 10.5,
        tenureMonths: 60,
        emiAmount: 36500,
      });
      expect(Number(res.body.emiAmount)).toBe(36500);
    });

    it("keeps the expected commission % from Staff — they can neither read nor change it", async () => {
      const asStaff = await put(`/applications/${applicationId}/sanction`, staff, { commissionPercent: 5, bankRm: "Via staff" });
      expect(asStaff.status).toBe(200);
      expect(asStaff.body.bankRm).toBe("Via staff");
      expect(asStaff.body).not.toHaveProperty("commissionPercent");
      expect((await get(`/applications/${applicationId}/sanction`, staff)).body).not.toHaveProperty("commissionPercent");
      expect(Number((await get(`/applications/${applicationId}/sanction`, admin)).body.commissionPercent)).toBe(0.9);
      await put(`/applications/${applicationId}/sanction`, admin, { bankRm: "Asha Rao" });
    });

    it("recalculates when the terms change and no EMI is given", async () => {
      const res = await put(`/applications/${applicationId}/sanction`, admin, { tenureMonths: 120 });
      expect(Number(res.body.emiAmount)).toBe(22938.95);
      // put the terms back for the rest of the run
      await put(`/applications/${applicationId}/sanction`, admin, { tenureMonths: 60 });
    });
  });

  describe("disbursal", () => {
    it("records how the money moved and what reached the borrower", async () => {
      const res = await post(`/applications/${applicationId}/disbursements`, admin, {
        amount: 1000000,
        disbursedAt: "2026-07-24",
        mode: "RTGS",
        utrNo: "UTR12345",
        bankName: "HDFC Bank",
        accountNo: "50100012345678",
        ifsc: "hdfc0001234",
        processingFee: 17000,
        insuranceAmount: 8000,
        otherDeductions: 500,
      });
      expect(res.status).toBe(201);
      expect(res.body.mode).toBe("RTGS");
      expect(res.body.ifsc).toBe("HDFC0001234");
      expect(Number(res.body.netAmount)).toBe(974500);
      expect(res.body.type).toBe("PART");
      payoutId = res.body.id;
    });

    it("refuses deductions larger than the payout", async () => {
      const res = await post(`/applications/${applicationId}/disbursements`, admin, {
        amount: 1000,
        disbursedAt: "2026-07-25",
        processingFee: 900,
        stampDuty: 200,
      });
      expect(res.status).toBe(400);
    });

    it("moves the sanction to part-disbursed", async () => {
      const res = await get(`/applications/${applicationId}/sanction`, admin);
      expect(res.body.disbursalStatus).toBe("PARTIAL");
      expect(res.body.drawn).toBe(1000000);
      expect(res.body.undrawn).toBe(700000);
    });

    it("the register carries the number, the lender-side status and a total", async () => {
      const res = await get("/sanctions", admin);
      expect(res.body.items[0].sanctionNo).toBeDefined();
      expect(Number(res.body.totalSanctioned)).toBeGreaterThanOrEqual(1700000);
    });
  });

  describe("commission lifecycle", () => {
    it("takes a flat lender amount, splits by amount or share, and extra sources", async () => {
      const res = await post(`/disbursements/${payoutId}/commission`, admin, {
        grossAmount: 9000,
        splits: [
          { sourcingPartnerId: partnerId, amount: 1800, stakeholderRole: "Partner" },
          { userId: (await get("/team/assignable", admin)).body[0].id, sharePercent: 10, stakeholderRole: "RO" },
        ],
        extras: [{ source: "SUBVENTION", amount: 2000, note: "Builder subvention" }],
      });
      expect(res.status).toBe(201);
      expect(Number(res.body.grossAmount)).toBe(9000);
      expect(Number(res.body.grossRate)).toBe(0.9);
      expect(res.body.status).toBe("PENDING");
      const partner = res.body.splits.find((s: { stakeholderRole: string }) => s.stakeholderRole === "Partner");
      expect(Number(partner.sharePercent)).toBe(20);
      const officer = res.body.splits.find((s: { stakeholderRole: string }) => s.stakeholderRole === "RO");
      expect(Number(officer.amount)).toBe(900);
      expect(res.body.extras).toHaveLength(1);
      commissionId = res.body.id;
    });

    it("still takes a plain rate", async () => {
      const other = await post(`/applications/${applicationId}/disbursements`, admin, {
        amount: 100000,
        disbursedAt: "2026-08-01",
      });
      const res = await post(`/disbursements/${other.body.id}/commission`, admin, { grossRate: 1.5 });
      expect(res.status).toBe(201);
      expect(Number(res.body.grossAmount)).toBe(1500);
    });

    it("needs a rate or an amount, and never pays out more than it earns", async () => {
      const other = await post(`/applications/${applicationId}/disbursements`, admin, {
        amount: 50000,
        disbursedAt: "2026-08-02",
      });
      expect((await post(`/disbursements/${other.body.id}/commission`, admin, {})).status).toBe(400);
      expect(
        (
          await post(`/disbursements/${other.body.id}/commission`, admin, {
            grossAmount: 1000,
            splits: [{ sourcingPartnerId: partnerId, amount: 1200 }],
          })
        ).status,
      ).toBe(400);
    });

    it("is claimed once, then cannot be claimed again", async () => {
      const claimed = await post(`/commissions/${commissionId}/claim`, admin, { note: "Invoice 42 raised" });
      expect(claimed.status).toBe(201);
      expect(claimed.body.status).toBe("CLAIMED");
      expect(claimed.body.claimedAt).toBeTruthy();
      expect(claimed.body.claimNote).toBe("Invoice 42 raised");
      expect((await post(`/commissions/${commissionId}/claim`, admin)).status).toBe(400);
    });

    it("moves to part-received, then received, as the lender pays", async () => {
      const part = await post(`/commissions/${commissionId}/receive`, admin, {
        amount: 4000,
        reference: "UTR-LENDER-1",
      });
      expect(part.status).toBe(201);
      expect(part.body.status).toBe("PARTIAL");
      expect(Number(part.body.receivedAmount)).toBe(4000);

      expect((await post(`/commissions/${commissionId}/receive`, admin, { amount: 9000 })).status).toBe(400);

      const rest = await post(`/commissions/${commissionId}/receive`, admin, {});
      expect(rest.body.status).toBe("PAID");
      expect(Number(rest.body.receivedAmount)).toBe(9000);
      expect(rest.body.receivedAt).toBeTruthy();
      expect((await post(`/commissions/${commissionId}/receive`, admin, {})).status).toBe(400);
    });

    it("tracks extra commissions to their own receipt", async () => {
      const extra = (await get(`/disbursements/${payoutId}/commission`, admin)).body.extras[0];
      const paid = await patch(`/commissions/${commissionId}/extras/${extra.id}`, admin, { status: "PAID" });
      expect(paid.body.status).toBe("PAID");
      expect(paid.body.receivedAt).toBeTruthy();

      const added = await post(`/commissions/${commissionId}/extras`, admin, { source: "CROSS_SELL", amount: 500 });
      expect(added.status).toBe(201);
      const removed = await http.delete(`${API}/commissions/${commissionId}/extras/${added.body.id}`).set(as(admin));
      expect(removed.status).toBe(200);
    });

    it("the ledger summarises where the money stands", async () => {
      const res = await get("/commissions", admin);
      expect(res.body.summary.PAID.count).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.PENDING.count).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.PAID.received).toBeGreaterThanOrEqual(9000);
      const filtered = await get("/commissions?status=CLAIMED", admin);
      expect(filtered.status).toBe(200);
    });

    it("Staff can neither claim nor record receipts", async () => {
      expect((await post(`/commissions/${commissionId}/claim`, staff)).status).toBe(403);
      expect((await post(`/commissions/${commissionId}/receive`, staff)).status).toBe(403);
      expect((await post(`/commissions/${commissionId}/extras`, staff, { source: "OTHER", amount: 1 })).status).toBe(403);
    });
  });

  describe("the money trail of a file", () => {
    it("adds up requested, sanctioned, disbursed and earned", async () => {
      const res = await get(`/applications/${applicationId}/money-trail`, admin);
      expect(res.status).toBe(200);
      expect(res.body.requested).toBe(1700000);
      expect(res.body.sanctioned).toBe(1700000);
      expect(res.body.disbursed).toBe(1000000 + 100000 + 50000);
      expect(res.body.commission.lender).toBe(9000 + 1500);
      expect(res.body.commission.extras).toBe(2000);
      expect(res.body.commission.received).toBe(9000 + 2000);
      expect(res.body.commission.sharedOut).toBeGreaterThan(0);
      expect(res.body.commission.retained).toBe(res.body.commission.total - res.body.commission.sharedOut);
    });

    it("shows Staff the money moved but never what GCS earns", async () => {
      const res = await get(`/applications/${applicationId}/money-trail`, staff);
      expect(res.status).toBe(200);
      expect(res.body.sanctioned).toBe(1700000);
      expect(res.body.commission).toBeNull();
      expect(JSON.stringify(res.body)).not.toMatch(/lender|sharedOut|retained/);
    });
  });
});
