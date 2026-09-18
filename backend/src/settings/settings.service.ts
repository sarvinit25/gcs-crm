import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { DEFAULTS, SETTINGS, SETTINGS_BY_KEY, type SettingDef } from "./settings.registry";

@Injectable()
export class SettingsService implements OnModuleInit {
  /**
   * Settings are read on nearly every request and written rarely, so they're
   * held in memory and refreshed on write rather than hitting the database
   * each time.
   */
  private cache = new Map<string, unknown>();

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async onModuleInit() {
    await this.refresh();
  }

  private async refresh() {
    const stored = await this.prisma.setting.findMany();
    this.cache = new Map(Object.entries(DEFAULTS));
    for (const row of stored) {
      // Keys removed from the registry are ignored rather than surfaced.
      if (SETTINGS_BY_KEY.has(row.key)) this.cache.set(row.key, row.value);
    }
  }

  get<T>(key: string): T {
    return (this.cache.has(key) ? this.cache.get(key) : DEFAULTS[key]) as T;
  }

  /**
   * The human-facing application reference, e.g. GCS-2026-0042. Built from
   * settings so a firm can change its prefix or numbering width without a
   * code change. Existing files are not renumbered.
   */
  applicationNo(seq: number, createdAt: Date) {
    const parts = [this.get<string>("numbering.applicationPrefix") || "GCS"];
    if (this.get<boolean>("numbering.includeYear")) parts.push(String(createdAt.getFullYear()));
    parts.push(String(seq).padStart(this.get<number>("numbering.applicationPadding"), "0"));
    return parts.join("-");
  }

  /** The registry plus current values — everything the settings screen renders. */
  all() {
    return SETTINGS.map((def) => ({
      ...def,
      value: this.get(def.key),
      isDefault: JSON.stringify(this.get(def.key)) === JSON.stringify(def.default),
    }));
  }

  /** Values the public website may read. */
  publicValues() {
    return Object.fromEntries(
      SETTINGS.filter((s) => s.publicFacing).map((s) => [s.key, this.get(s.key)]),
    );
  }

  private coerce(def: SettingDef, raw: unknown) {
    switch (def.type) {
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new BadRequestException(`${def.label} must be a number`);
        if (def.min !== undefined && n < def.min) {
          throw new BadRequestException(`${def.label} cannot be below ${def.min}`);
        }
        if (def.max !== undefined && n > def.max) {
          throw new BadRequestException(`${def.label} cannot be above ${def.max}`);
        }
        return n;
      }
      case "boolean":
        return Boolean(raw);
      case "list": {
        if (!Array.isArray(raw)) throw new BadRequestException(`${def.label} must be a list`);
        const items = raw.map((v) => String(v).trim()).filter(Boolean);
        if (!items.length) throw new BadRequestException(`${def.label} cannot be empty`);
        if (new Set(items).size !== items.length) {
          throw new BadRequestException(`${def.label} contains duplicates`);
        }
        return items;
      }
      case "email": {
        const text = String(raw ?? "").trim();
        if (text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
          throw new BadRequestException(`${def.label} must be a valid email address`);
        }
        return text;
      }
      case "phone": {
        const text = String(raw ?? "").trim();
        if (text && !/^[6-9]\d{9}$/.test(text)) {
          throw new BadRequestException(`${def.label} must be a 10-digit Indian mobile number`);
        }
        return text;
      }
      default:
        return String(raw ?? "").trim();
    }
  }

  async update(key: string, raw: unknown, actor: AuthUser, ip?: string) {
    const def = SETTINGS_BY_KEY.get(key);
    if (!def) throw new NotFoundException(`Unknown setting "${key}"`);

    const before = this.get(key);
    const value = this.coerce(def, raw);

    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
    await this.refresh();

    // Settings change behaviour firm-wide, so every edit is on the record.
    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "Setting",
      entityId: key,
      entityLabel: def.label,
      changes: { [key]: { from: before, to: value } },
      ip,
    });

    return { key, value };
  }

  async reset(key: string, actor: AuthUser, ip?: string) {
    const def = SETTINGS_BY_KEY.get(key);
    if (!def) throw new NotFoundException(`Unknown setting "${key}"`);

    const before = this.get(key);
    await this.prisma.setting.deleteMany({ where: { key } });
    await this.refresh();

    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "Setting",
      entityId: key,
      entityLabel: `${def.label} (reset to default)`,
      changes: { [key]: { from: before, to: def.default } },
      ip,
    });

    return { key, value: def.default };
  }
}
