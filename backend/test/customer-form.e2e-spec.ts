/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";
import { StorageService } from "../src/documents/storage.service";

const API = "/crm/api";
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"), Buffer.alloc(64)]);

/** The customer-facing application form: staff send a link, the customer fills it in and uploads documents, staff review. */
describe("customer application form", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let staffA: string;
  let staffB: string;
  let staffAId: string;
  let productId: string;

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t?: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(as(t)).send(body);
  const put = (path: string, t: string | undefined, body: object) => http.put(`${API}${path}`).set(as(t)).send(body);
  const del = (path: string, t?: string) => http.delete(`${API}${path}`).set(as(t));
  const patch = (path: string, t: string, body: object) => http.patch(`${API}${path}`).set(as(t)).send(body);
  const upload = (token: string, buf: Buffer, filename: string, category = "KYC") =>
    http.post(`${API}/public/apply/${token}/documents`).field("category", category).attach("file", buf, { filename, contentType: "application/pdf" });

  let phoneSeq = 0;
  /** A draft application owned by staff A with a primary applicant, plus a live link. */
  async function newFile(opts: { phone?: string | null; ownerId?: string } = {}) {
    const phone = opts.phone === null ? undefined : (opts.phone ?? `90001${String(70000 + phoneSeq++)}`);
    const created = await post("/applications", admin, {
      loanProductId: productId,
      requestedAmount: 1_500_000,
      ownerId: opts.ownerId ?? staffAId,
      applicants: [{ name: "Asha Customer", ...(phone && { phone }), isPrimary: true }],
    });
    return { id: created.body.id as string, phone };
  }
  async function newLink(opts: Parameters<typeof newFile>[0] = {}) {
    const file = await newFile(opts);
    const status = await post(`/applications/${file.id}/customer-form`, admin);
    return { ...file, token: status.body.token as string };
  }

  const complete = {
    name: "Asha Customer",
    dateOfBirth: "1990-05-17",
    pan: "ABCDE1234F",
    address: "12 MG Road, Andheri",
    city: "Mumbai",
    pincode: "400001",
    employmentType: "SALARIED",
    employerName: "Acme Pvt Ltd",
    monthlyIncome: 85000,
    requestedAmount: 2_000_000,
    tenureMonths: 120,
    purpose: "Home purchase",
    references: [
      { name: "Ravi Kulkarni", phone: "9876500001", relation: "Friend" },
      { name: "Meena Joshi", phone: "9876500002", relation: "Colleague" },
    ],
  };

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    admin = (await post("/auth/login", undefined, { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
    staffAId = (await post("/team", admin, { name: "Form Staff A", email: "form.a@example.com", role: "ADVISOR", password: "StaffPass#12345" })).body.id;
    await post("/team", admin, { name: "Form Staff B", email: "form.b@example.com", role: "ADVISOR", password: "StaffPass#12345" });
    staffA = await signIn(post, "form.a@example.com", "StaffPass#12345");
    staffB = await signIn(post, "form.b@example.com", "StaffPass#12345");
    productId = ((await get("/loan-products", admin)).body as { id: string }[])[0].id;
  });

  afterAll(async () => {
    // Submitted files can't be removed through the customer's link, so clear the stored objects directly.
    const storage = app.get(StorageService);
    for (const d of await prisma.document.findMany({ select: { objectKey: true } })) await storage.remove(d.objectKey).catch(() => undefined);
    await app?.close();
  });

  describe("staff sending the link", () => {
    it("needs a login", async () => {
      const f = await newFile();
      expect((await get(`/applications/${f.id}/customer-form`)).status).toBe(401);
      expect((await post(`/applications/${f.id}/customer-form`, undefined)).status).toBe(401);
    });

    it("can be sent by the file's owner or an admin, but not by another staff member", async () => {
      const f = await newFile();
      expect((await get(`/applications/${f.id}/customer-form`, staffB)).status).toBe(404);
      expect((await post(`/applications/${f.id}/customer-form`, staffB)).status).toBe(404);
      expect((await del(`/applications/${f.id}/customer-form`, staffB)).status).toBe(404);
      const sent = await post(`/applications/${f.id}/customer-form`, staffA);
      expect(sent.status).toBe(201);
      expect(sent.body).toMatchObject({ sent: true, state: "open" });
      expect(sent.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect((await get(`/applications/${f.id}/customer-form`, admin)).body.state).toBe("open");
    });

    it("needs the applicant's mobile number, and only works while the file is a draft", async () => {
      const noPhone = await newFile({ phone: null });
      const res = await post(`/applications/${noPhone.id}/customer-form`, admin);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/mobile number/);

      const moved = await newFile();
      await patch(`/applications/${moved.id}`, admin, { status: "SUBMITTED" });
      expect((await post(`/applications/${moved.id}/customer-form`, admin)).status).toBe(400);
      expect((await get(`/applications/${moved.id}/customer-form`, admin)).body.canSend).toBe(false);
    });

    it("keeps only a hash and an encrypted copy of the link in the database", async () => {
      const f = await newLink();
      const row = await prisma.applicationInvite.findFirstOrThrow({ where: { applicationId: f.id } });
      expect(row.tokenHash).not.toContain(f.token);
      expect(row.tokenEnc.startsWith("enc1:")).toBe(true);
      expect(JSON.stringify(row)).not.toContain(f.token);
    });

    it("sending a new link retires the old one; withdrawing stops the current one", async () => {
      const f = await newLink();
      const second = (await post(`/applications/${f.id}/customer-form`, admin)).body.token;
      expect(second).not.toBe(f.token);
      expect((await get(`/public/apply/${f.token}`)).body.state).toBe("closed");
      expect((await get(`/public/apply/${second}`)).body.state).toBe("open");
      await del(`/applications/${f.id}/customer-form`, admin);
      expect((await get(`/public/apply/${second}`)).body.state).toBe("closed");
      expect((await put(`/public/apply/${second}`, undefined, { city: "Pune" })).status).toBe(409);
    });
  });

  describe("the customer opening the link", () => {
    it("needs no login, and shows what staff already entered", async () => {
      const f = await newLink();
      const res = await get(`/public/apply/${f.token}`);
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("open");
      expect(res.body.phone).toBe(f.phone);
      expect(res.body.form).toMatchObject({ name: "Asha Customer", requestedAmount: 1_500_000 });
      expect(res.body.company.name).toBeTruthy();
      expect(res.body.product).toBeTruthy();
      expect(Array.isArray(res.body.checklist)).toBe(true);
      expect(res.body.categories).toContain("KYC");
      expect(res.body.limits).toMatchObject({ referencesRequired: 2 });
      expect(res.body).not.toHaveProperty("token");
      const status = (await get(`/applications/${f.id}/customer-form`, admin)).body;
      expect(status.openedAt).toBeTruthy();
    });

    it.each(["not-a-token", "x".repeat(43), `${"a".repeat(42)}!`, "..%2F..%2Fetc"])("treats %s as not valid", async (bad) => {
      expect((await get(`/public/apply/${bad}`)).status).toBe(404);
      expect((await put(`/public/apply/${bad}`, undefined, { city: "Pune" })).status).toBe(404);
      expect((await post(`/public/apply/${bad}/submit`, undefined, { declaration: true })).status).toBe(404);
    });

    it("shows nothing about the file once the link has expired or the file has moved on", async () => {
      const f = await newLink();
      await prisma.applicationInvite.updateMany({ where: { applicationId: f.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = await get(`/public/apply/${f.token}`);
      expect(expired.body.state).toBe("expired");
      expect(expired.body).not.toHaveProperty("form");
      expect(expired.body).not.toHaveProperty("phone");
      expect((await put(`/public/apply/${f.token}`, undefined, { city: "Pune" })).status).toBe(409);

      const g = await newLink();
      await patch(`/applications/${g.id}`, admin, { status: "SUBMITTED" });
      expect((await get(`/public/apply/${g.token}`)).body.state).toBe("closed");
      expect((await post(`/public/apply/${g.token}/submit`, undefined, { declaration: true })).status).toBe(409);
    });
  });

  describe("saving as they go", () => {
    it("keeps a draft without touching the real records, and merges later saves", async () => {
      const f = await newLink();
      expect((await put(`/public/apply/${f.token}`, undefined, { city: "Pune", pan: "ABCDE1234F" })).status).toBe(200);
      expect((await put(`/public/apply/${f.token}`, undefined, { pincode: "411001", city: null })).status).toBe(200);
      const form = (await get(`/public/apply/${f.token}`)).body.form;
      expect(form).toMatchObject({ pan: "ABCDE1234F", pincode: "411001", city: null });
      // Staff still see the file as it was until the customer submits.
      const real = (await get(`/applications/${f.id}`, admin)).body.applicants[0];
      expect(real.pan).toBeNull();
      expect((await get(`/applications/${f.id}/customer-form`, admin)).body.lastSavedAt).toBeTruthy();
    });

    it.each([
      [{ pan: "abc" }, /PAN/],
      [{ pincode: "12" }, /Pincode/],
      [{ employmentType: "WIZARD" }, /employmentType/],
      [{ references: [{ name: "X", phone: "123" }] }, /phone|name/],
      [{ monthlyIncome: -5 }, /monthlyIncome/],
      [{ phone: "9999999999" }, /should not exist/], // the number is fixed
      [{ status: "DISBURSED" }, /should not exist/], // nothing beyond the form's own fields
      [{ address: "x".repeat(6000) }, /too long/],
    ])("refuses %j", async (body, message) => {
      const f = await newLink();
      const res = await put(`/public/apply/${f.token}`, undefined, body);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toMatch(message);
    });
  });

  describe("uploading documents", () => {
    it("accepts a real PDF, files it under a known category, and lets the customer remove their own", async () => {
      const f = await newLink();
      const ok = await upload(f.token, PDF, "pan card.pdf", "KYC");
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ category: "KYC", fileName: "pan card.pdf" });
      const other = await upload(f.token, PDF, "misc.pdf", "Totally Made Up");
      expect(other.body.category).toBe("Other");

      // It is a normal document on the file, marked as the customer's.
      const docs = (await get(`/applications/${f.id}/documents`, staffA)).body as any[];
      expect(docs.map((d) => d.fileName).sort()).toEqual(["misc.pdf", "pan card.pdf"]);
      expect(docs.every((d) => d.inviteId && d.uploadedBy === null)).toBe(true);
      expect((await get(`/applications/${f.id}/customer-form`, admin)).body.documentsReceived).toBe(2);

      expect((await del(`/public/apply/${f.token}/documents/${ok.body.id}`)).status).toBe(200);
      expect((await del(`/public/apply/${f.token}/documents/${other.body.id}`)).status).toBe(200);
      expect(((await get(`/applications/${f.id}/documents`, staffA)).body as any[]).length).toBe(0);
    });

    it("rejects a web page or program with a document's name", async () => {
      const f = await newLink();
      const html = await upload(f.token, Buffer.from("<html><script>alert(1)</script></html>"), "pan.pdf");
      expect(html.status).toBe(400);
      expect(html.body.message).toMatch(/Only PDF, JPG, PNG, WebP or HEIC/);
      expect((await upload(f.token, Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64)]), "statement.pdf")).status).toBe(400);
      expect((await http.post(`${API}/public/apply/${f.token}/documents`)).status).toBe(400); // no file at all
    });

    it("stops at the configured number of files", async () => {
      await put("/settings/forms.maxFilesPerLink", admin, { value: 1 });
      try {
        const f = await newLink();
        const first = await upload(f.token, PDF, "one.pdf");
        expect(first.status).toBe(201);
        const second = await upload(f.token, PDF, "two.pdf");
        expect(second.status).toBe(400);
        expect(second.body.message).toMatch(/up to 1 file/);
        await del(`/public/apply/${f.token}/documents/${first.body.id}`);
      } finally {
        await del("/settings/forms.maxFilesPerLink", admin);
      }
    });

    it("never lets the customer touch a document staff filed, or one from another link", async () => {
      const f = await newLink();
      const g = await newLink();
      const staffDoc = await http
        .post(`${API}/applications/${f.id}/documents`)
        .set(as(admin))
        .field("category", "KYC")
        .attach("file", PDF, { filename: "staff.pdf", contentType: "application/pdf" });
      expect(staffDoc.status).toBe(201);
      const theirs = await upload(g.token, PDF, "theirs.pdf");

      expect((await del(`/public/apply/${f.token}/documents/${staffDoc.body.id}`)).status).toBe(404);
      expect((await del(`/public/apply/${f.token}/documents/${theirs.body.id}`)).status).toBe(404);
      // And the customer's list shows only their own.
      expect((await get(`/public/apply/${f.token}`)).body.documents).toEqual([]);

      await del(`/applications/${f.id}/documents/${staffDoc.body.id}`, admin);
      await del(`/public/apply/${g.token}/documents/${theirs.body.id}`);
    });

    it("ticks a checklist item as received once a document of its category exists, even one staff filed", async () => {
      const f = await newLink();
      const before = (await get(`/public/apply/${f.token}`)).body.checklist as { category: string; received: boolean }[];
      expect(before.length).toBeGreaterThan(0);
      const target = before[0].category;
      const doc = await upload(f.token, PDF, "proof.pdf", target);
      expect(doc.status).toBe(201);
      const after = (await get(`/public/apply/${f.token}`)).body.checklist as { category: string; received: boolean }[];
      expect(after.filter((i) => i.category === target).every((i) => i.received)).toBe(true);
      await del(`/public/apply/${f.token}/documents/${doc.body.id}`);
    });
  });

  describe("sending it in", () => {
    it("refuses without the declaration, and names whatever is missing", async () => {
      const f = await newLink();
      expect((await post(`/public/apply/${f.token}/submit`, undefined, {})).status).toBe(400);
      expect((await post(`/public/apply/${f.token}/submit`, undefined, { declaration: false })).status).toBe(400);
      const res = await post(`/public/apply/${f.token}/submit`, undefined, { declaration: true });
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(["dateOfBirth", "pan", "address", "city", "pincode", "employmentType", "monthlyIncome", "references"]));
      // Nothing was applied, and the form is still open.
      expect((await get(`/public/apply/${f.token}`)).body.state).toBe("open");
      expect((await get(`/applications/${f.id}`, admin)).body.applicants[0].pan).toBeNull();
    });

    it("applies the answers to the file, locks the link, and tells staff", async () => {
      const f = await newLink();
      expect((await put(`/public/apply/${f.token}`, undefined, complete)).status).toBe(200);
      const doc = await upload(f.token, PDF, "aadhaar.pdf");

      // Before submission, the owner has nothing to review.
      expect(((await get("/notifications", staffA)).body.items as any[]).some((n) => n.id === `form-${f.id}`)).toBe(false);

      const res = await post(`/public/apply/${f.token}/submit`, undefined, { declaration: true });
      expect(res.status).toBe(201);
      expect(res.body.submitted).toBe(true);
      expect(res.body.applicationNo).toMatch(/^GCS-/);

      const file = (await get(`/applications/${f.id}`, staffA)).body;
      expect(file.requestedAmount).toBe("2000000");
      expect(file.tenureMonths).toBe(120);
      expect(file.purpose).toBe("Home purchase");
      expect(file.applicants[0]).toMatchObject({
        name: "Asha Customer",
        pan: "ABCDE1234F",
        city: "Mumbai",
        pincode: "400001",
        employmentType: "SALARIED",
        employerName: "Acme Pvt Ltd",
        phone: f.phone, // untouched
      });
      expect(file.applicants[0].dateOfBirth).toMatch(/^1990-05-17/);
      expect(file.references.map((r: any) => r.name).sort()).toEqual(["Meena Joshi", "Ravi Kulkarni"]);
      expect(file.status).toBe("DRAFT"); // staff decide what happens next

      // Locked from here on.
      expect((await get(`/public/apply/${f.token}`)).body.state).toBe("submitted");
      expect((await put(`/public/apply/${f.token}`, undefined, { city: "Delhi" })).status).toBe(409);
      expect((await upload(f.token, PDF, "late.pdf")).status).toBe(409);
      expect((await del(`/public/apply/${f.token}/documents/${doc.body.id}`)).status).toBe(409);
      expect((await post(`/public/apply/${f.token}/submit`, undefined, { declaration: true })).status).toBe(409);

      // Staff are told, with the right link into the file, and it clears once they take the file forward.
      const note = ((await get("/notifications", staffA)).body.items as any[]).find((n) => n.id === `form-${f.id}`);
      expect(note).toMatchObject({ kind: "form", severity: "high", path: `/applications/${f.id}`, hash: "customer-form" });
      expect(((await get("/notifications", staffB)).body.items as any[]).some((n) => n.id === `form-${f.id}`)).toBe(false);
      const status = (await get(`/applications/${f.id}/customer-form`, staffA)).body;
      expect(status).toMatchObject({ state: "submitted", documentsReceived: 1 });
      expect(status.submittedAt).toBeTruthy();

      await patch(`/applications/${f.id}`, admin, { status: "SUBMITTED" });
      expect(((await get("/notifications", staffA)).body.items as any[]).some((n) => n.id === `form-${f.id}`)).toBe(false);
    });

    it("is recorded in the audit trail as the customer's own action", async () => {
      const f = await newLink();
      await put(`/public/apply/${f.token}`, undefined, complete);
      const doc = await upload(f.token, PDF, "audit.pdf");
      await post(`/public/apply/${f.token}/submit`, undefined, { declaration: true });

      const entries = await prisma.auditLog.findMany({ where: { actorType: "CLIENT", OR: [{ entityId: f.id }, { entityId: doc.body.id }] } });
      expect(entries.map((e) => `${e.entity}:${e.action}`).sort()).toEqual(["Application:UPDATE", "Document:CREATE"]);
      const submit = entries.find((e) => e.entity === "Application")!;
      expect(submit.entityLabel).toMatch(/submitted by the customer/);
      expect(JSON.stringify(submit.changes)).toContain("ABCDE1234F");
      // And the staff side: the link being sent was logged against the staff member.
      const sent = await prisma.auditLog.findFirst({ where: { entityId: f.id, actorType: "STAFF", entityLabel: { contains: "customer form link" } } });
      expect(sent).toBeTruthy();
    });

    it("lets staff send a fresh link after a submission, starting from the answers already given", async () => {
      const f = await newLink();
      await put(`/public/apply/${f.token}`, undefined, complete);
      await post(`/public/apply/${f.token}/submit`, undefined, { declaration: true });
      const again = (await post(`/applications/${f.id}/customer-form`, admin)).body;
      expect(again.state).toBe("open");
      const form = (await get(`/public/apply/${again.token}`)).body.form;
      expect(form).toMatchObject({ pan: "ABCDE1234F", city: "Mumbai", requestedAmount: 2_000_000 });
      expect(form.references).toHaveLength(2);
    });
  });
});
