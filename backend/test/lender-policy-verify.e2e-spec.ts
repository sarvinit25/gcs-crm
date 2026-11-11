import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";

const API = "/crm/api";

/** Checking many lender policies at once: only a manager or admin, each one recorded, and nothing happens on its own. */
describe("lender policies: bulk check", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let staff: string;
  const ids: string[] = [];

  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(t ? as(t) : {}).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    admin = (await post("/auth/login", undefined, { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
    await post("/team", admin, { name: "Policy Staff", email: "policy.staff@example.com", role: "ADVISOR", password: "StaffPass#12345" });
    staff = await signIn(post, "policy.staff@example.com", "StaffPass#12345");

    const product = await prisma.loanProduct.findFirstOrThrow({ where: { slug: "home-loan" } });
    const lenders = await prisma.lender.findMany({ take: 3, orderBy: { name: "asc" } });
    for (const l of lenders) {
      const p = await prisma.lenderPolicy.create({ data: { lenderId: l.id, loanProductId: product.id, source: "Flyer reading: test (2026-11-10)" } });
      ids.push(p.id);
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it("starts with none of them checked", async () => {
    const rows = await prisma.lenderPolicy.findMany({ where: { id: { in: ids } } });
    expect(rows.every((r) => r.lastVerifiedAt === null)).toBe(true);
  });

  it("is refused for Staff, and changes nothing", async () => {
    const res = await post("/lender-policies/verify-many", staff, { ids });
    expect(res.status).toBe(403);
    const rows = await prisma.lenderPolicy.findMany({ where: { id: { in: ids } } });
    expect(rows.every((r) => r.lastVerifiedAt === null)).toBe(true);
  });

  it("refuses an empty list", async () => {
    expect((await post("/lender-policies/verify-many", admin, { ids: [] })).status).toBe(400);
  });

  it("marks the chosen ones checked under the person's name, skips unknown ids, and leaves the rest alone", async () => {
    const res = await post("/lender-policies/verify-many", admin, { ids: [ids[0]!, ids[1]!, "no-such-policy"] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ verified: 2, skipped: 1 });
    const rows = await prisma.lenderPolicy.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(ids[0]!)!.lastVerifiedAt).not.toBeNull();
    expect(byId.get(ids[0]!)!.verifiedByName).toBeTruthy();
    expect(byId.get(ids[1]!)!.lastVerifiedAt).not.toBeNull();
    expect(byId.get(ids[2]!)!.lastVerifiedAt).toBeNull();
  });

  it("keeps a history entry and an audit line for each policy checked", async () => {
    const changes = await prisma.lenderPolicyChange.count({ where: { policyId: { in: [ids[0]!, ids[1]!] } } });
    expect(changes).toBeGreaterThanOrEqual(2);
    const audits = await prisma.auditLog.count({ where: { entity: "LenderPolicy", entityId: { in: [ids[0]!, ids[1]!] } } });
    expect(audits).toBeGreaterThanOrEqual(2);
  });
});
