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
  "siteInfo",
  "pageText",
  "bankRates",
  "seo",
  "testimonials",
  "trustNumbers",
  "customPages",
  "images",
  "lists",
] as const;
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
    if (!/^[a-z]+\.[a-z]+$/.test(name) || name.length > 60) throw bad("Unknown list name");
    if (!Array.isArray(items) || items.length > 100) throw bad("A list can have up to 100 items");
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw bad("Every list item must be a set of fields");
      for (const [field, text] of Object.entries(item as Record<string, unknown>)) {
        if (field.length > 40 || typeof text !== "string" || text.length > 2000) throw bad("List fields must be short plain text");
      }
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
  if (key === "lists") assertLists(value);
}

/** What the marketing website reads: every edited section, keyed by name. */
@Controller("public/site-content")
export class PublicSiteContentController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async all() {
    const rows = await this.prisma.siteContent.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
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
    const file = [
      join(process.cwd(), "prisma", "site-content.defaults.json"),
      join(__dirname, "..", "..", "prisma", "site-content.defaults.json"),
    ].find((f) => existsSync(f));
    return file ? JSON.parse(readFileSync(file, "utf8")) : {};
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
