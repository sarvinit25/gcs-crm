import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { IsDefined } from "class-validator";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";

/** The sections of website content staff can edit. Anything else is refused. */
export const SITE_CONTENT_KEYS = [
  "faqs",
  "products",
  "caseStudies",
  "services",
  "caLegal",
  "siteInfo",
  "pageText",
  "bankRates",
  "seo",
  "testimonials",
  "trustNumbers",
  "customPages",
  "images",
  "lists",
  "homeText",
  "aboutText",
  "contactText",
  "servicesText",
  "cibilText",
  "whyusText",
  "calegalText",
  "partnerText",
  "trackText",
  "builderText",
  "freelancerText",
  "estimatorText",
  "insightsText",
  "casesText",
  "ratesText",
  "toolsText",
  "advisorText",
  "advisoryText",
  "cityText",
  "loanPageText",
  "casePageText",
  "servicePageText",
  "siteText",
] as const;
/** The copy built into the website, as shipped with the CRM (prisma/site-content.defaults.json). */
function readDefaults(): Record<string, unknown> {
  const file = [
    join(process.cwd(), "prisma", "site-content.defaults.json"),
    join(__dirname, "..", "..", "prisma", "site-content.defaults.json"),
  ].find((f) => existsSync(f));
  return file ? JSON.parse(readFileSync(file, "utf8")) : {};
}

/** The addresses of the CA & legal services built into the website. A service added in the CRM may not reuse one. */
function builtInServiceSlugs(): string[] {
  const services = readDefaults().services;
  return services && typeof services === "object" ? Object.keys(services) : [];
}

/** Wording edited per language: pageText:hi, pageText:mr. */
const LANGUAGE_KEY = /^pageText:(hi|mr)$/;
const MAX_BYTES = 400_000;
const HISTORY_LIMIT = 30;

class SaveContentDto {
  @IsDefined() value: unknown;
}

function assertKey(key: string) {
  if (!(SITE_CONTENT_KEYS as readonly string[]).includes(key) && !LANGUAGE_KEY.test(key)) {
    throw new BadRequestException(`Unknown content section "${key}"`);
  }
}

/** pageText is { "<page path or *>": { "<original wording>": "<new wording>" } }, all plain text. */
function assertPageText(value: unknown) {
  const bad = () => new BadRequestException("Page text must be edits grouped by page");
  if (Array.isArray(value)) throw bad();
  for (const [page, edits] of Object.entries(value as Record<string, unknown>)) {
    if (page.length > 200 || !edits || typeof edits !== "object" || Array.isArray(edits)) throw bad();
    for (const [from, to] of Object.entries(edits as Record<string, unknown>)) {
      if (typeof to !== "string" || from.length > 2000 || to.length > 2000) throw bad();
    }
  }
}

/** seo is { "<page path>": { title?, description? } }, plain text. */
function assertSeo(value: unknown) {
  const bad = () => new BadRequestException("Search listings must be a title and description per page");
  if (Array.isArray(value)) throw bad();
  for (const [path, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!path.startsWith("/") || path.length > 200 || !entry || typeof entry !== "object" || Array.isArray(entry)) throw bad();
    for (const [field, text] of Object.entries(entry as Record<string, unknown>)) {
      if ((field !== "title" && field !== "description") || typeof text !== "string" || text.length > 400) throw bad();
    }
  }
}

/** customPages is a list of pages and articles; slugs must be unique, plain, and not clash with the site. */
function assertPages(value: unknown) {
  const bad = (m: string) => new BadRequestException(m);
  if (!Array.isArray(value)) throw bad("Pages must be a list");
  if (value.length > 200) throw bad("That is too many pages");
  const seen = new Set<string>();
  for (const raw of value as Record<string, unknown>[]) {
    const slug = typeof raw?.slug === "string" ? raw.slug : "";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
      throw bad("A page address may only use lowercase letters, numbers and dashes");
    }
    if (seen.has(slug)) throw bad(`Two pages share the address "${slug}"`);
    seen.add(slug);
    if (typeof raw.title !== "string" || raw.title.length < 2 || raw.title.length > 200) throw bad("Every page needs a title");
    if (raw.kind !== "post" && raw.kind !== "page") throw bad("A page must be an article or a page");
    if (typeof raw.body !== "string" || raw.body.length > 30000) throw bad("A page body is too long");
    if (raw.image !== undefined && raw.image !== "" && !/^\/public\/site-images\/[A-Za-z0-9]+$/.test(String(raw.image))) {
      throw bad("A cover picture must be one uploaded through the CRM");
    }
  }
}

/** lists maps a list name to its items: [{ field: text }], all plain text. */
function assertLists(value: unknown) {
  const bad = (m: string) => new BadRequestException(m);
  if (Array.isArray(value)) throw bad("Lists must be grouped by list name");
  for (const [name, items] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-zA-Z]+\.[a-zA-Z]+$/.test(name) || name.length > 60) throw bad("Unknown list name");
    if (!Array.isArray(items) || items.length > 100) throw bad("A list can have up to 100 items");
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw bad("Every list item must be a set of fields");
      for (const [field, text] of Object.entries(item as Record<string, unknown>)) {
        if (field.length > 40 || typeof text !== "string" || text.length > 2000) throw bad("List fields must be short plain text");
      }
    }
  }
}


const CA_LEGAL_DIVISIONS = ["CA Services", "Legal Services"];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * caLegal is { custom?, hidden?, blurbs? }: services staff added to the CA & Legal pages, the addresses of services
 * to hide, and the line under each category in the website's header menu. All plain text. A service added here may
 * not take an address a built-in service already has, so it can never replace one.
 */
export function assertCaLegal(value: unknown, builtIn: string[]) {
  const bad = (m: string) => new BadRequestException(m);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw bad("CA & Legal must be a set of settings");
  const v = value as Record<string, unknown>;
  for (const k of Object.keys(v)) if (!["custom", "hidden", "blurbs"].includes(k)) throw bad(`Unknown CA & Legal setting "${k}"`);

  const text = (x: unknown, min: number, max: number) => typeof x === "string" && x.trim().length >= min && x.length <= max;
  const lines = (x: unknown, what: string) => {
    if (x === undefined) return;
    if (!Array.isArray(x) || x.length > 30) throw bad(`${what} can have up to 30 lines`);
    for (const line of x) if (!text(line, 1, 400)) throw bad(`Every line of ${what.toLowerCase()} must be short text`);
  };

  if (v.custom !== undefined) {
    if (!Array.isArray(v.custom) || v.custom.length > 60) throw bad("You can add up to 60 services");
    const seen = new Set<string>();
    for (const raw of v.custom as Record<string, unknown>[]) {
      const c = raw && typeof raw === "object" ? raw : {};
      const slug = typeof c.slug === "string" ? c.slug : "";
      if (!SLUG.test(slug) || slug.length > 80) throw bad("A service address may only use lowercase letters, numbers and dashes");
      if (seen.has(slug)) throw bad(`Two services share the address "${slug}"`);
      if (builtIn.includes(slug)) throw bad(`"${slug}" is already a built-in service address`);
      seen.add(slug);
      if (!CA_LEGAL_DIVISIONS.includes(c.division as string)) throw bad("A service must belong to CA Services or Legal Services");
      if (!text(c.category, 2, 60)) throw bad("Every service needs a category");
      if (!text(c.title, 2, 120)) throw bad("Every service needs a title");
      if (!text(c.summary, 1, 1500)) throw bad("Every service needs a short description");
      if (c.whoNeedsIt !== undefined && !text(c.whoNeedsIt, 0, 1500)) throw bad("\"Who needs it\" is too long");
      lines(c.process, "Steps");
      lines(c.documents, "Documents");
      if (c.icon !== undefined && !(typeof c.icon === "string" && /^[a-z]{2,20}$/.test(c.icon))) throw bad("Unknown icon");
    }
  }
  if (v.hidden !== undefined) {
    if (!Array.isArray(v.hidden) || v.hidden.length > 300 || v.hidden.some((h) => typeof h !== "string" || !SLUG.test(h) || h.length > 80)) {
      throw bad("Hidden services must be a list of service addresses");
    }
  }
  if (v.blurbs !== undefined) {
    const b = v.blurbs;
    if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).length > 60) throw bad("Menu lines must be set per category");
    for (const [cat, line] of Object.entries(b)) {
      if (!text(cat, 1, 60) || !text(line, 0, 120)) throw bad("A menu line must be short plain text (up to 120 characters)");
    }
  }
}

/** homeText and aboutText map a page field (like "hero.title") to the wording to show there. */
function assertHomeText(value: unknown) {
  if (Array.isArray(value)) throw new BadRequestException("Home page wording must be a set of fields");
  for (const [id, text] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z]+\.[a-zA-Z]+$/.test(id) || id.length > 60 || typeof text !== "string" || text.length > 2000) {
      throw new BadRequestException("Home page wording must be short plain text");
    }
  }
}

/** trustNumbers maps a figure on the site to the figure to show instead, e.g. "75+" -> "90+". */
function assertFigures(value: unknown) {
  if (Array.isArray(value)) throw new BadRequestException("Figures must be a list of replacements");
  for (const [from, to] of Object.entries(value as Record<string, unknown>)) {
    if (typeof to !== "string" || from.length > 40 || to.length > 40) {
      throw new BadRequestException("Each figure must be short text");
    }
  }
}

/** images maps a website picture path to a picture uploaded to the CRM. */
function assertImages(value: unknown) {
  if (Array.isArray(value)) throw new BadRequestException("Images must be a list of replacements");
  for (const [from, to] of Object.entries(value as Record<string, unknown>)) {
    if (typeof to !== "string" || !/^\/public\/site-images\/[A-Za-z0-9]+$/.test(to) || from.length > 500) {
      throw new BadRequestException("Each picture must be one uploaded through the CRM");
    }
  }
}

const PHOTO_PATH = /^\/public\/site-images\/[A-Za-z0-9]+$/;
const short = (v: unknown, max: number) => v === undefined || v === null || (typeof v === "string" && v.length <= max);

/**
 * Client stories. Each can carry a photo (a picture uploaded through the CRM) and a record of the client's consent.
 * A story that shows a photo must have photo consent on record: nothing the client did not agree to goes on the site.
 */
export function assertTestimonials(value: unknown) {
  if (!Array.isArray(value) || value.length > 80) throw new BadRequestException("Client stories must be a list of at most 80");
  for (const raw of value) {
    const t = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
    if (!t) throw new BadRequestException("Each client story must be an object");
    if (!short(t.name, 120) || !short(t.city, 80) || !short(t.product, 120) || !short(t.role, 120) || !short(t.quote, 1200)) {
      throw new BadRequestException("A client story has text that is too long");
    }
    if (t.photo !== undefined && t.photo !== "" && (typeof t.photo !== "string" || !PHOTO_PATH.test(t.photo))) {
      throw new BadRequestException("A story's photo must be one uploaded through the CRM");
    }
    const consent = (t.consent && typeof t.consent === "object" ? t.consent : {}) as Record<string, unknown>;
    if (!short(consent.how, 40) || !short(consent.date, 20) || !short(consent.note, 300)) throw new BadRequestException("A consent note is too long");
    if (t.photo && t.visible !== false && consent.photoOk !== true) {
      throw new BadRequestException(`${typeof t.name === "string" && t.name ? t.name : "A story"} has a photo but no photo consent on record. Record the consent, or remove the photo, or hide the story.`);
    }
  }
}

/** What the public website may see of the client stories: only shown ones, no consent notes, and a photo only with its consent. */
export function publicTestimonials(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .filter((t) => t && typeof t === "object" && (t as { visible?: unknown }).visible !== false)
    .map((raw) => {
      const t = raw as Record<string, unknown>;
      const consent = (t.consent && typeof t.consent === "object" ? t.consent : {}) as Record<string, unknown>;
      return {
        name: t.name, city: t.city, product: t.product, rating: t.rating, quote: t.quote, visible: true,
        ...(typeof t.role === "string" && t.role ? { role: t.role } : {}),
        ...(typeof t.photo === "string" && PHOTO_PATH.test(t.photo) && consent.photoOk === true ? { photo: t.photo } : {}),
      };
    });
}

function validate(key: string, value: unknown) {
  if (value === null || typeof value !== "object") {
    throw new BadRequestException("Content must be a list or an object");
  }
  if (Array.isArray(value) && key !== "caseStudies" && key !== "testimonials" && key !== "customPages") {
    throw new BadRequestException("This section must be an object");
  }
  if (JSON.stringify(value).length > MAX_BYTES) {
    throw new BadRequestException("That is too much text for one section");
  }
  if (key === "pageText" || LANGUAGE_KEY.test(key)) assertPageText(value);
  if (key === "images") assertImages(value);
  if (key === "seo") assertSeo(value);
  if (key === "trustNumbers") assertFigures(value);
  if (key === "customPages") assertPages(value);
  if (key === "testimonials") assertTestimonials(value);
  if (key === "lists") assertLists(value);
  if (key === "caLegal") assertCaLegal(value, builtInServiceSlugs());
  if (key === "homeText" || key === "aboutText" || key === "contactText" || key === "servicesText" || key === "cibilText" || key === "whyusText" ||
    key === "calegalText" || key === "partnerText" || key === "trackText" ||
    key === "builderText" ||
    key === "freelancerText" ||
    key === "estimatorText" ||
    key === "insightsText" ||
    key === "casesText" ||
    key === "ratesText" ||
    key === "toolsText" ||
    key === "advisorText" ||
    key === "advisoryText" ||
    key === "cityText" ||
    key === "loanPageText" ||
    key === "casePageText" ||
    key === "servicePageText" ||
    key === "siteText") assertHomeText(value);
}

/** What the marketing website reads: every edited section, keyed by name. */
@Controller("public/site-content")
export class PublicSiteContentController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async all() {
    const rows = await this.prisma.siteContent.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.key === "testimonials" ? publicTestimonials(r.value) : r.value]));
  }
}

/** Admin-only editing of that content, with a history so any change can be undone. */
@Controller("settings/site-content")
export class SiteContentAdminController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN)
  async all() {
    const rows = await this.prisma.siteContent.findMany();
    return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt, updatedByName: r.updatedByName }));
  }

  /** The copy built into the website — what the editor shows until staff save their own. */
  @Get("defaults")
  @Roles(Role.ADMIN)
  defaults() {
    return readDefaults();
  }

  /** Recent saves of one section, newest first. */
  @Get(":key/history")
  @Roles(Role.ADMIN)
  async history(@Param("key") key: string) {
    assertKey(key);
    const rows = await this.prisma.siteContentVersion.findMany({
      where: { key },
      orderBy: { savedAt: "desc" },
      take: HISTORY_LIMIT,
    });
    return rows.map((r) => ({
      id: r.id,
      savedAt: r.savedAt,
      savedByName: r.savedByName,
      reset: r.value === null,
      size: r.value === null ? 0 : JSON.stringify(r.value).length,
    }));
  }

  /** Puts a past version back (itself recorded, so a restore can be undone too). */
  @Post(":key/restore/:versionId")
  @Roles(Role.ADMIN)
  async restore(@Param("key") key: string, @Param("versionId") versionId: string, @CurrentUser() user: AuthUser) {
    assertKey(key);
    const version = await this.prisma.siteContentVersion.findFirst({ where: { id: versionId, key } });
    if (!version) throw new NotFoundException("That version no longer exists");
    if (version.value === null) return this.writeReset(key, user);
    return this.write(key, version.value as object, user);
  }

  @Put(":key")
  @Roles(Role.ADMIN)
  async save(@Param("key") key: string, @Body() dto: SaveContentDto, @CurrentUser() user: AuthUser) {
    assertKey(key);
    validate(key, dto.value);
    return this.write(key, dto.value as object, user);
  }

  /** Back to the copy built into the website. */
  @Delete(":key")
  @Roles(Role.ADMIN)
  async reset(@Param("key") key: string, @CurrentUser() user: AuthUser) {
    assertKey(key);
    return this.writeReset(key, user);
  }

  private async write(key: string, value: object, user: AuthUser) {
    const [row] = await this.prisma.$transaction([
      this.prisma.siteContent.upsert({
        where: { key },
        update: { value, updatedByName: user.name },
        create: { key, value, updatedByName: user.name },
      }),
      this.prisma.siteContentVersion.create({ data: { key, value, savedByName: user.name } }),
    ]);
    return row;
  }

  private async writeReset(key: string, user: AuthUser) {
    await this.prisma.$transaction([
      this.prisma.siteContent.deleteMany({ where: { key } }),
      this.prisma.siteContentVersion.create({ data: { key, value: Prisma.DbNull, savedByName: user.name } }),
    ]);
    return { ok: true };
  }
}
