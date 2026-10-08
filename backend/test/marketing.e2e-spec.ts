/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";

const API = "/crm/api";

/** Where leads come from, what was spent, and what each channel cost per lead and per customer. */
describe("marketing", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let admin: string;
  let manager: string;
  let staff: string;
  let productId: string;

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t?: string) => http.get(`${API}${path}`).set(as(t));
  const post = (path: string, t: string | undefined, body: object = {}) => http.post(`${API}${path}`).set(as(t)).send(body);
  const patch = (path: string, t: string, body: object) => http.patch(`${API}${path}`).set(as(t)).send(body);
  const put = (path: string, t: string, body: object) => http.put(`${API}${path}`).set(as(t)).send(body);
  const del = (path: string, t: string) => http.delete(`${API}${path}`).set(as(t));
  const row = (res: any, key: string) => (res.body.rows as any[]).find((r) => r.key === key);

  let phone = 0;
  const nextPhone = () => `90003${String(10000 + phone++)}`;
  const lead = async (body: object = {}) =>
    (await post("/leads", admin, { name: "Mkt Lead", phone: nextPhone(), source: "e2e", ...body })).body.id as string;
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    admin = (await post("/auth/login", undefined, { email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
    await post("/team", admin, { name: "Mkt Manager", email: "mkt.manager@example.com", role: "MANAGER", password: "StaffPass#12345" });
    await post("/team", admin, { name: "Mkt Staff", email: "mkt.staff@example.com", role: "ADVISOR", password: "StaffPass#12345" });
    manager = await signIn(post, "mkt.manager@example.com", "StaffPass#12345");
    staff = await signIn(post, "mkt.staff@example.com", "StaffPass#12345");
    productId = ((await get("/loan-products", admin)).body as { id: string }[])[0].id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("crediting a lead to a channel", () => {
    it("reads the channel and campaign from the tracking tags a website lead arrives with", async () => {
      const res = await post("/public/leads", undefined, {
        name: "Ad Visitor", phone: nextPhone(), source: "landing-page", productSlug: "business-loan",
        utmSource: "google", utmMedium: "cpc", utmCampaign: "business-loan-oct", utmContent: "headline-a", utmTerm: "business loan mumbai",
        landingPage: "https://growthcapitalservices.in/lp/business-loan?phone=9876543210#form",
      });
      expect(res.status).toBe(201);
      const saved = await prisma.lead.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(saved).toMatchObject({
        channel: "Google Search Ads", campaign: "business-loan-oct", utmSource: "google", utmMedium: "cpc",
        utmContent: "headline-a", utmTerm: "business loan mumbai", landingPage: "/lp/business-loan",
      });
    });

    it("leaves the channel blank when the tags say nothing recognisable, and never trusts a channel sent from outside", async () => {
      const res = await post("/public/leads", undefined, { name: "No Tags", phone: nextPhone(), source: "contact-form" });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: res.body.id } })).channel).toBeNull();

      const forged = await post("/public/leads", undefined, { name: "Forger", phone: nextPhone(), source: "contact-form", channel: "Referral" });
      expect(forged.status).toBe(400);
      expect(JSON.stringify(forged.body.message)).toMatch(/channel should not exist/);
      const odd = await post("/public/leads", undefined, { name: "Odd Tags", phone: nextPhone(), source: "contact-form", utmSource: "some-blog", utmMedium: "banner-swap", utmCampaign: "swap" });
      const saved = await prisma.lead.findUniqueOrThrow({ where: { id: odd.body.id } });
      expect(saved.channel).toBeNull();
      expect(saved.campaign).toBe("swap");
    });

    it("lets staff credit a lead to any channel, change it later, and filter the list by it", async () => {
      const id = await lead({ channel: "E2E Society Drive", campaign: "Andheri East - Oct" });
      expect((await get(`/leads/${id}`, admin)).body).toMatchObject({ channel: "E2E Society Drive", campaign: "Andheri East - Oct" });
      expect((await patch(`/leads/${id}`, admin, { channel: "E2E Mall Stall" })).body.channel).toBe("E2E Mall Stall");
      const listed = (await get("/leads?channel=E2E%20Mall%20Stall", admin)).body.items as any[];
      expect(listed.map((l) => l.id)).toEqual([id]);

      expect((await patch(`/leads/${id}`, admin, { channel: "", campaign: "" })).status).toBe(200);
      const cleared = await prisma.lead.findUniqueOrThrow({ where: { id } });
      expect(cleared.channel).toBeNull();
      expect(cleared.campaign).toBeNull();
      expect(((await get("/leads?channel=none", admin)).body.items as any[]).some((l) => l.id === id)).toBe(true);
    });

    it("offers the channel list to every signed-in person, covering digital, offline and relationship sources", async () => {
      const channels = (await get("/marketing/channels", staff)).body as string[];
      expect(channels).toEqual(expect.arrayContaining(["Google Search Ads", "Meta Ads (Instagram)", "WhatsApp", "Hoardings", "Society activation", "Roadshow", "Referral"]));
      expect((await get("/marketing/channels")).status).toBe(401);
    });
  });

  describe("what each channel cost and brought", () => {
    let disbursedLead: string;

    beforeAll(async () => {
      const channel = "E2E Roadshow";
      await lead({ channel, campaign: "Dadar roadshow" }); // stays new
      const qualified = await lead({ channel, campaign: "Dadar roadshow" });
      await patch(`/leads/${qualified}`, admin, { status: "QUALIFIED" });
      const lost = await lead({ channel, campaign: "Thane roadshow" });
      await patch(`/leads/${lost}`, admin, { status: "LOST", lostReason: "Not interested" });
      disbursedLead = await lead({ channel, campaign: "Thane roadshow", landingPage: "/lp/roadshow" });
      const application = (await post("/applications", admin, { leadId: disbursedLead, loanProductId: productId, requestedAmount: 1000000, applicants: [{ name: "Won Customer", phone: nextPhone(), isPrimary: true }] })).body;
      await put(`/applications/${application.id}/sanction`, admin, { technicalStatus: "APPROVED", financialStatus: "APPROVED", legalStatus: "APPROVED", sanctionedAmount: 1000000 });
      const payout = await post(`/applications/${application.id}/disbursements`, admin, { amount: 400000, disbursedAt: today });
      await post(`/disbursements/${payout.body.id}/commission`, admin, { grossRate: 1.5 });

      expect((await post("/marketing/spend", admin, { spentOn: today, channel, campaign: "Dadar roadshow", amount: 6000, vendor: "Agency" })).status).toBe(201);
      expect((await post("/marketing/spend", manager, { spentOn: today, channel, campaign: "Thane roadshow", amount: 4000 })).status).toBe(201);
      expect((await post("/marketing/spend", admin, { spentOn: today, channel: "E2E Silent Hoarding", amount: 5000 })).status).toBe(201);
      expect((await post("/marketing/spend", admin, { spentOn: "2020-01-15", channel: "E2E Old Spend", amount: 7000 })).status).toBe(201);
    });

    it("follows the leads of a channel all the way to a disbursal, with cost at every step", async () => {
      const res = await get("/marketing/performance?by=channel&range=all", admin);
      expect(res.status).toBe(200);
      expect(row(res, "E2E Roadshow")).toMatchObject({
        leads: 4, qualified: 2, lost: 1, applications: 1, sanctioned: 1, disbursed: 1,
        disbursedAmount: 400000, commission: 6000, spend: 10000,
        costPerLead: 2500, costPerQualified: 5000, costPerApplication: 10000, costPerDisbursal: 10000,
        qualifiedRate: 50, applicationRate: 25, disbursalRate: 25, returnOnSpend: 0.6,
      });
    });

    it("shows spend that brought no leads at all, and totals it all up", async () => {
      const res = await get("/marketing/performance?by=channel&range=all", admin);
      expect(row(res, "E2E Silent Hoarding")).toMatchObject({ leads: 0, spend: 5000, costPerLead: null });
      expect(res.body.total.spend).toBeGreaterThanOrEqual(22000);
      expect(res.body.funnel.map((s: any) => s.stage)).toEqual(["Leads", "Qualified", "Applications", "Sanctioned", "Disbursed"]);
      expect(res.body.funnel[0].count).toBe(res.body.total.leads);
      expect(row(res, "Not tracked").leads).toBeGreaterThan(0); // leads with no channel are visible, not hidden
    });

    it("can be sliced by campaign, landing page and month", async () => {
      const campaigns = await get("/marketing/performance?by=campaign&range=all", admin);
      expect(row(campaigns, "E2E Roadshow / Dadar roadshow")).toMatchObject({ leads: 2, qualified: 1, spend: 6000, costPerLead: 3000 });
      expect(row(campaigns, "E2E Roadshow / Thane roadshow")).toMatchObject({ leads: 2, lost: 1, disbursed: 1, spend: 4000 });

      const pages = await get("/marketing/performance?by=landing&range=all", admin);
      expect(row(pages, "/lp/roadshow")).toMatchObject({ leads: 1, disbursed: 1 });
      expect(row(pages, "/lp/business-loan").leads).toBeGreaterThanOrEqual(1);
      expect(pages.body.spendTracked).toBe(false);

      const months = await get("/marketing/performance?by=month&range=all", admin);
      const keys = (months.body.rows as any[]).map((r) => r.key);
      expect(keys).toEqual([...keys].sort());
      expect(row(months, today.slice(0, 7)).leads).toBeGreaterThanOrEqual(4);
      expect(keys).toContain("2020-01"); // old spend sits in its own month
    });

    it("respects the period: old spend drops out of this month, and today's leads out of last month", async () => {
      const thisMonth = await get("/marketing/performance?by=channel&range=month", admin);
      expect(row(thisMonth, "E2E Old Spend")).toBeUndefined();
      expect(row(thisMonth, "E2E Roadshow").leads).toBe(4);
      const lastMonth = await get("/marketing/performance?by=channel&range=last_month", admin);
      expect(row(lastMonth, "E2E Roadshow")).toBeUndefined();
      expect(row(await get("/marketing/performance?by=channel&from=2020-01-01&to=2020-01-31", admin), "E2E Old Spend")).toMatchObject({ spend: 7000, leads: 0 });
    });

    it("exports the same figures as a CSV", async () => {
      const res = await get("/marketing/performance/export?by=channel&range=all", admin);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      expect(res.headers["content-disposition"]).toMatch(/gcs-marketing-channel-\d{4}-\d{2}-\d{2}\.csv/);
      expect(res.text).toContain("Cost per qualified lead");
      expect(res.text).toMatch(/E2E Roadshow,10000,4,2,1,1,1,400000,6000,2500,5000,10000,10000,50,25,25,0\.6/);
      expect(res.text).toContain("TOTAL");
    });
  });

  describe("the spend log", () => {
    let id: string;

    it("takes an entry, tidies the text, and lists it with a running total", async () => {
      const made = await post("/marketing/spend", manager, { spentOn: today, channel: "  E2E Log Channel ", campaign: " Diwali\n", amount: 1234.5, note: "Agency invoice 14" });
      expect(made.status).toBe(201);
      id = made.body.id;
      expect(made.body).toMatchObject({ channel: "E2E Log Channel", campaign: "Diwali", amount: "1234.5" });
      const list = (await get("/marketing/spend?channel=E2E%20Log%20Channel&range=all", admin)).body;
      expect(list).toMatchObject({ count: 1, total: 1234.5 });
      expect(list.items[0].createdBy.name).toBe("Mkt Manager");
    });

    it("refuses nonsense", async () => {
      for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 1e12 }, { amount: 10.123 }, { channel: "x" }, { spentOn: "not-a-date" }]) {
        const res = await post("/marketing/spend", admin, { spentOn: today, channel: "E2E Bad", amount: 100, ...bad });
        expect(res.status).toBe(400);
      }
    });

    it("can be corrected and removed, and every change is in the audit trail", async () => {
      expect((await patch(`/marketing/spend/${id}`, admin, { amount: 2000, campaign: null, vendor: "Digital agency" })).body).toMatchObject({ amount: "2000", campaign: null, vendor: "Digital agency" });
      expect((await del(`/marketing/spend/${id}`, admin)).status).toBe(200);
      expect((await del(`/marketing/spend/${id}`, admin)).status).toBe(404);
      expect((await patch(`/marketing/spend/${id}`, admin, { amount: 1 })).status).toBe(404);
      const trail = await prisma.auditLog.findMany({ where: { entity: "MarketingSpend", entityId: id }, orderBy: { createdAt: "asc" } });
      expect(trail.map((t) => t.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
    });
  });

  describe("who can see the money", () => {
    it("is for Admin and Manager; Staff get the channel list and nothing else", async () => {
      for (const path of ["/marketing/performance", "/marketing/performance/export", "/marketing/spend"]) {
        expect((await get(path, staff)).status).toBe(403);
        expect((await get(path)).status).toBe(401);
        expect((await get(path, manager)).status).toBe(200);
      }
      expect((await post("/marketing/spend", staff, { spentOn: today, channel: "Hoardings", amount: 100 })).status).toBe(403);
      expect((await get("/marketing/channels", staff)).status).toBe(200);
    });

    it("rejects an unknown way of slicing instead of passing it to the database", async () => {
      expect((await get("/marketing/performance?by=l.channel%3B%20DROP%20TABLE", admin)).status).toBe(400);
    });
  });
});
