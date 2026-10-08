import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException, Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import { Role } from "@prisma/client";
import { IsDefined } from "class-validator";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";

/** The sections of website text staff can edit. Anything else is refused. */
export const SITE_CONTENT_KEYS = ["faqs", "products", "caseStudies", "services", "siteInfo", "pageText"] as const;
const MAX_BYTES = 400_000;

class SaveContentDto {
  @IsDefined() value: unknown;
}

function assertKey(key: string) {
  if (!(SITE_CONTENT_KEYS as readonly string[]).includes(key)) {
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

/** Admin-only editing of that content. */
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

  @Put(":key")
  @Roles(Role.ADMIN)
  async save(@Param("key") key: string, @Body() dto: SaveContentDto, @CurrentUser() user: AuthUser) {
    assertKey(key);
    if (dto.value === null || typeof dto.value !== "object") {
      throw new BadRequestException("Content must be a list or an object");
    }
    if (JSON.stringify(dto.value).length > MAX_BYTES) {
      throw new BadRequestException("That is too much text for one section");
    }
    if (key === "pageText") assertPageText(dto.value);
    const value = dto.value as object;
    return this.prisma.siteContent.upsert({
      where: { key },
      update: { value, updatedByName: user.name },
      create: { key, value, updatedByName: user.name },
    });
  }

  /** Back to the copy built into the website. */
  @Delete(":key")
  @Roles(Role.ADMIN)
  async reset(@Param("key") key: string) {
    assertKey(key);
    await this.prisma.siteContent.deleteMany({ where: { key } });
    return { ok: true };
  }
}
