/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./app";
import { signIn } from "./sign-in";
import { PrismaService } from "../src/prisma/prisma.service";
import { StorageService } from "../src/documents/storage.service";
import { istToday } from "../src/common/date.util";

const API = "/crm/api";
// A real 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The pop-up poster: staff upload it with a date range, the public site shows whichever is live today. */
describe("website pop-up ads", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let storage: StorageService;
  let admin: string;
  let manager: string;
  let staff: string;
  const today = istToday();
  const keys: string[] = [];

  const as = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});
  const get = (path: string, t?: string) => http.get(`${API}${path}`).set(as(t));

  const upload = async (fields: Record<string, string>, opts: { file?: Buffer | null; token?: string; name?: string } = {}) => {
    const req = http.post(`${API}/website-ads`).set(as(opts.token ?? admin));
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    if (opts.file !== null) req.attach("file", opts.file ?? PNG, opts.name ?? "poster.png");
    const res = await req;
    if (res.body?.id) {
      const row = await prisma.websiteAd.findUnique({ where: { id: res.body.id } });
      if (row) keys.push(row.imageKey);
    }
    return res;
  };
  const ad = (title: string, startsOn: string, endsOn: string, extra: Record<string, string> = {}) => ({ title, startsOn, endsOn, ...extra });
  const clearAds = async () => {
    await prisma.websiteAd.deleteMany();
  };

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer()) as never;
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    admin = (await http.post(`${API}/auth/login`).send({ email: "admin@growthcapitalservices.in", password: "ChangeMe123!" })).body.accessToken;
    for (const [name, email, role] of [["AD Manager", "ad.manager@example.com", "MANAGER"], ["AD Staff", "ad.staff@example.com", "ADVISOR"]]) {
      await http.post(`${API}/team`).set(as(admin)).send({ name, email, role, password: "StaffPass#12345" });
    }
    manager = await signIn((p: string, t: string | undefined, b: object) => http.post(`${API}${p}`).set(as(t)).send(b), "ad.manager@example.com", "StaffPass#12345");
    staff = await signIn((p: string, t: string | undefined, b: object) => http.post(`${API}${p}`).set(as(t)).send(b), "ad.staff@example.com", "StaffPass#12345");
  });

  afterAll(async () => {
    await clearAds();
    await Promise.all(keys.map((k) => storage.remove(k).catch(() => undefined)));
    await app?.close();
  });

  beforeEach(clearAds);

  describe("uploading", () => {
    it("stores the poster with its dates and shows it as live inside the range", async () => {
      const res = await upload(ad("Diwali offer", addDays(today, -1), addDays(today, 5), { linkUrl: "https://growthcapitalservices.in/contact" }), { token: manager });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ title: "Diwali offer", status: "LIVE", startsOn: addDays(today, -1), endsOn: addDays(today, 5), imageMime: "image/png" });
      expect(res.body.imageKey).toBeUndefined(); // storage keys are never sent out
      const list = await get("/website-ads", admin);
      expect(list.body.items).toHaveLength(1);
    });

    it("runs for the whole of both the first and the last day", async () => {
      const res = await upload(ad("One day", today, today));
      expect(res.body.status).toBe("LIVE");
      const row = await prisma.websiteAd.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.endsAt.getTime() - row.startsAt.getTime()).toBe(86_400_000 - 1);
    });

    it("refuses what is not a poster", async () => {
      const d = ad("Bad", today, today);
      expect((await upload(d, { file: null })).status).toBe(400);
      expect((await upload(d, { file: Buffer.from("%PDF-1.4 hello hello hello"), name: "poster.png" })).status).toBe(400);
      expect((await upload(d, { file: Buffer.from("<script>alert(1)</script>"), name: "poster.png" })).status).toBe(400);
      expect((await upload(d, { file: Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]) })).status).toBe(413);
      expect(await prisma.websiteAd.count()).toBe(0);
    });

    it("refuses bad dates and unsafe links", async () => {
      expect((await upload(ad("Backwards", addDays(today, 3), today))).status).toBe(400);
      expect((await upload(ad("Not a date", "31-10-2026", today))).status).toBe(400);
      expect((await upload(ad("Impossible", "2026-02-31", "2026-03-02"))).status).toBe(400);
      for (const link of ["javascript:alert(1)", "http://insecure.example.com", "//evil.example.com", "not a url"]) {
        expect((await upload(ad("Link", today, today, { linkUrl: link }))).status).toBe(400);
      }
      expect((await upload(ad("Blank link is fine", today, today, { linkUrl: "" }))).status).toBe(201);
    });

    it("is for Admin and Manager only", async () => {
      expect((await upload(ad("Nope", today, today), { token: staff })).status).toBe(403);
      expect((await get("/website-ads", staff)).status).toBe(403);
      expect((await get("/website-ads")).status).toBe(401);
      expect((await http.post(`${API}/website-ads`).field("title", "x").attach("file", PNG, "p.png")).status).toBe(401);
      expect(await prisma.websiteAd.count()).toBe(0);
    });
  });

  describe("what the public website sees", () => {
    it("nothing when nothing is running", async () => {
      const res = await get("/public/website-ad");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ad: null });
    });

    it("the running ad, with a picture anyone can load", async () => {
      const made = await upload(ad("Live one", today, addDays(today, 2), { linkUrl: "https://example.com/offer" }));
      const res = await get("/public/website-ad");
      expect(res.body.ad).toMatchObject({ id: made.body.id, title: "Live one", linkUrl: "https://example.com/offer" });
      expect(res.body.ad.imagePath).toMatch(new RegExp(`^/public/website-ad/${made.body.id}/image\\?v=\\d+$`));

      const img = await get(res.body.ad.imagePath.replace(/\?.*/, ""));
      expect(img.status).toBe(200);
      expect(img.headers["content-type"]).toBe("image/png");
      expect(img.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(Buffer.compare(img.body, PNG)).toBe(0);
    });

    it("scheduled, ended and paused ads are invisible, and their pictures are not served", async () => {
      const future = await upload(ad("Future", addDays(today, 3), addDays(today, 6)));
      const past = await upload(ad("Past", addDays(today, -6), addDays(today, -3)));
      const paused = await upload(ad("Paused", today, addDays(today, 1)));
      await http.patch(`${API}/website-ads/${paused.body.id}`).set(as(admin)).send({ paused: true });

      expect((await get("/public/website-ad")).body).toEqual({ ad: null });
      for (const a of [future, past, paused]) {
        expect((await get(`/public/website-ad/${a.body.id}/image`)).status).toBe(404);
        expect((await get(`/website-ads/${a.body.id}/image`, admin)).status).toBe(200); // staff can still preview
      }
      expect((await get("/website-ads", admin)).body.items.map((i: any) => i.status).sort()).toEqual(["ENDED", "PAUSED", "SCHEDULED"]);
    });

    it("when two overlap, the one that started most recently shows", async () => {
      await upload(ad("Older", addDays(today, -5), addDays(today, 5)));
      const newer = await upload(ad("Newer", addDays(today, -1), addDays(today, 5)));
      expect((await get("/public/website-ad")).body.ad.id).toBe(newer.body.id);
    });
  });

  describe("managing", () => {
    it("changes dates, link and title, pauses and resumes, and audits each change", async () => {
      const made = await upload(ad("Editable", addDays(today, 2), addDays(today, 4)));
      expect(made.body.status).toBe("SCHEDULED");
      const patch = (b: object) => http.patch(`${API}/website-ads/${made.body.id}`).set(as(manager)).send(b);

      const moved = await patch({ startsOn: addDays(today, -1) });
      expect(moved.body).toMatchObject({ status: "LIVE", startsOn: addDays(today, -1), endsOn: addDays(today, 4) });
      expect((await patch({ endsOn: addDays(today, -5) })).status).toBe(400); // would end before it starts
      expect((await patch({ paused: true })).body.status).toBe("PAUSED");
      expect((await patch({ paused: false, title: "Renamed", linkUrl: "https://example.com/x" })).body).toMatchObject({ status: "LIVE", title: "Renamed", linkUrl: "https://example.com/x" });
      expect((await patch({ linkUrl: "" })).body.linkUrl).toBeNull();
      expect((await patch({ linkUrl: "javascript:alert(1)" })).status).toBe(400);

      const audit = await prisma.auditLog.findMany({ where: { entity: "WebsiteAd", entityId: made.body.id }, orderBy: { createdAt: "asc" } });
      expect(audit.map((a) => a.action)).toEqual(["CREATE", "UPDATE", "UPDATE", "UPDATE", "UPDATE"]);
    });

    it("deleting removes the ad and its picture from storage", async () => {
      const made = await upload(ad("Doomed", today, today));
      const key = (await prisma.websiteAd.findUniqueOrThrow({ where: { id: made.body.id } })).imageKey;
      expect((await http.delete(`${API}/website-ads/${made.body.id}`).set(as(staff))).status).toBe(403);
      expect((await http.delete(`${API}/website-ads/${made.body.id}`).set(as(admin))).status).toBe(200);
      expect((await get("/public/website-ad")).body).toEqual({ ad: null });
      await expect(storage.get(key)).rejects.toBeTruthy();
      expect((await http.delete(`${API}/website-ads/${made.body.id}`).set(as(admin))).status).toBe(404);
    });
  });
});
