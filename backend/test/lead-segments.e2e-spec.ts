/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";
import { LeadsService } from "../src/leads/leads.service";

const API = "/crm/api";
const NAME = "SegTest";

/** Leads sort into four working segments, in priority order, and the rules keep them current. */
describe("lead segments", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let staff: string;
  let slug: string;
  let n = 0;
  const phone = () => `9${String(66000000 + ++n).padStart(9, "0")}`;

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t = admin) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(as(t)).send(body);
  const patch = (path: string, t: string, body: object) => http.patch(`${API}${path}`).set(as(t)).send(body);
  const days = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

  const COMPLETE = { city: "Mumbai", amount: 5_000_000, employmentType: "SALARIED", monthlyIncome: 120_000, documentsStatus: "COMPLETE" };
  const make = async (label: string, extra: object = {}) => {
    const res = await post("/leads", admin, { name: `${NAME} ${label}`, phone: phone(), source: "manual-entry", ...extra });
    expect(res.status).toBe(201);
    return res.body as { id: string; segment: string | null };
  };

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    admin = (await post("/auth/login", undefined, { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
    await post("/team", admin, { name: "Seg Staff", email: "seg.staff@example.com", role: "ADVISOR", password: "StaffPass#12345" });
    staff = await signIn(post, "seg.staff@example.com", "StaffPass#12345");
    slug = (await prisma.loanProduct.findFirstOrThrow()).slug;
  });

  afterAll(async () => {
    await app?.close();
  });

  it("puts a new lead in the segment its details earn", async () => {
    expect((await make("bare")).segment).toBe("COLD");
    expect((await make("requirement", { productSlug: slug, amount: 2_000_000 })).segment).toBe("WARM");
    expect((await make("ready", { productSlug: slug, ...COMPLETE })).segment).toBe("HOT");
    expect((await make("later", { productSlug: slug, ...COMPLETE, nextFollowUpAt: days(7) })).segment).toBe("FOLLOW_UP");
  });

  it("explains why, and what is missing, on the lead", async () => {
    const warm = await make("why", { productSlug: slug, amount: 1_500_000 });
    const detail = (await get(`/leads/${warm.id}`)).body;
    expect(detail.segment).toBe("WARM");
    expect(detail.segmentNote).toContain("Still needed");
    expect(detail.missingForMeeting).toEqual(expect.arrayContaining(["city", "employment type", "monthly income", "documents"]));
  });

  it("moves a lead up as the missing details come in", async () => {
    const lead = await make("climbing", { productSlug: slug, amount: 3_000_000 });
    expect(lead.segment).toBe("WARM");
    const partial = await patch(`/leads/${lead.id}`, admin, { city: "Pune", employmentType: "SALARIED", monthlyIncome: 90_000 });
    expect(partial.body.segment).toBe("WARM");
    const done = await patch(`/leads/${lead.id}`, admin, { documentsStatus: "COMPLETE" });
    expect(done.body.segment).toBe("HOT");
  });

  it("parks a lead when a follow-up is set a few days out and brings it back when the date is near", async () => {
    const lead = await make("parked", { productSlug: slug, ...COMPLETE });
    expect(lead.segment).toBe("HOT");
    const logged = await post(`/leads/${lead.id}/follow-ups`, admin, { note: "Will decide after Diwali", dueAt: days(9) });
    expect(logged.status).toBe(201);
    expect((await get(`/leads/${lead.id}`)).body.segment).toBe("FOLLOW_UP");
    expect((await patch(`/leads/${lead.id}`, admin, { nextFollowUpAt: days(1) })).body.segment).toBe("HOT");
  });

  it("lists leads in priority order and filters by segment", async () => {
    const list = await get(`/leads?search=${NAME}&pageSize=100`);
    const order = list.body.items.map((l: any) => l.segment);
    const rank: Record<string, number> = { HOT: 0, WARM: 1, FOLLOW_UP: 2, COLD: 3 };
    expect(order.length).toBeGreaterThan(6);
    expect(order.map((s: string) => rank[s])).toEqual([...order.map((s: string) => rank[s])].sort((a, b) => a - b));

    const hot = await get(`/leads?search=${NAME}&segment=HOT&pageSize=100`);
    expect(hot.body.items.length).toBeGreaterThan(0);
    expect(hot.body.items.every((l: any) => l.segment === "HOT")).toBe(true);
  });

  it("puts the most overdue follow-up first inside a segment", async () => {
    const late = await make("late", { productSlug: slug, amount: 1_000_000, nextFollowUpAt: days(-3) });
    const soon = await make("soon", { productSlug: slug, amount: 1_000_000, nextFollowUpAt: days(1) });
    const items = (await get(`/leads?search=${NAME}&segment=WARM&pageSize=100`)).body.items.map((l: any) => l.id);
    expect(items.indexOf(late.id)).toBeLessThan(items.indexOf(soon.id));
  });

  it("counts leads per segment for the page chips, only the ones the caller may see", async () => {
    const all = (await get("/leads/segments")).body;
    expect(all.HOT).toBeGreaterThan(0);
    expect(all.WARM).toBeGreaterThan(0);
    expect(all.FOLLOW_UP).toBeGreaterThan(0);
    expect(all.COLD).toBeGreaterThan(0);

    const mine = (await get("/leads/segments", staff)).body;
    expect(mine).toMatchObject({ HOT: 0, WARM: 0, FOLLOW_UP: 0, COLD: 0 });
  });

  it("lets staff pin a segment, keeps it through later edits, and hands it back on request", async () => {
    const lead = await make("pinned");
    expect(lead.segment).toBe("COLD");
    const pinned = await patch(`/leads/${lead.id}`, admin, { segment: "HOT" });
    expect(pinned.body.segment).toBe("HOT");
    expect(pinned.body.segmentLocked).toBe(true);

    const edited = await patch(`/leads/${lead.id}`, admin, { city: "Thane" });
    expect(edited.body.segment).toBe("HOT");

    const auto = await patch(`/leads/${lead.id}`, admin, { segment: "AUTO" });
    expect(auto.body.segmentLocked).toBe(false);
    expect(auto.body.segment).toBe("COLD");
  });

  it("rejects a segment that does not exist", async () => {
    const lead = await make("bad");
    expect((await patch(`/leads/${lead.id}`, admin, { segment: "LUKEWARM" })).status).toBe(400);
  });

  it("takes a closed lead out of the segments, and puts it back when reopened", async () => {
    const lead = await make("closing", { productSlug: slug, ...COMPLETE });
    const lost = await patch(`/leads/${lead.id}`, admin, { status: "LOST", lostReason: "Not interested" });
    expect(lost.body.segment).toBeNull();
    const reopened = await patch(`/leads/${lead.id}`, admin, { status: "CONTACTED" });
    expect(reopened.body.segment).toBe("HOT");
  });

  it("unpins a pinned lead when it is closed", async () => {
    const lead = await make("pinned-closed");
    await patch(`/leads/${lead.id}`, admin, { segment: "WARM" });
    const lost = await patch(`/leads/${lead.id}`, admin, { status: "LOST", lostReason: "Not interested" });
    expect(lost.body.segment).toBeNull();
    expect(lost.body.segmentLocked).toBe(false);
  });

  it("gives website entries a segment too", async () => {
    const p = phone();
    const res = await post("/public/leads", undefined, { name: `${NAME} Web`, phone: p, source: "contact-form", productSlug: slug, amount: 4_000_000, city: "Pune" });
    expect(res.status).toBe(201);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(lead.segment).toBe("WARM");
  });

  it("works out segments for leads that predate the feature", async () => {
    const lead = await make("old", { productSlug: slug, ...COMPLETE });
    await prisma.lead.update({ where: { id: lead.id }, data: { segment: null, segmentNote: null } });
    await app.get(LeadsService).backfillSegments();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).segment).toBe("HOT");
  });
});
