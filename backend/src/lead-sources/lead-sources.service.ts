import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { DEFAULT_CHANNELS } from "../marketing/channel.util";
import { CreateLeadSourceDto, UpdateLeadSourceDto } from "./dto/lead-source.dto";

// Icon and colour for the sources that come with the CRM; anything else starts grey with no icon.
const STARTERS: Record<string, { code: string; icon: string; color: string; description: string }> = {
  "Walk-in": { code: "WALKIN", icon: "building", color: "#845adf", description: "Customer walked into the office" },
  "Website (direct)": { code: "WEB", icon: "globe", color: "#49b6f5", description: "Lead from the company website" },
  Referral: { code: "REF", icon: "users", color: "#26bf94", description: "Referred by an existing customer or partner" },
  "Cold calling": { code: "CALL", icon: "phone", color: "#f5b849", description: "Outbound or incoming phone enquiry" },
  "Social media (organic)": { code: "SOCIAL", icon: "share", color: "#1877f2", description: "Lead from social media platforms" },
  "Sourcing partner": { code: "PARTNER", icon: "handshake", color: "#5c67f7", description: "Lead from a business partner" },
  Email: { code: "EMAIL", icon: "mail", color: "#17a2b8", description: "Response to email marketing" },
  "Exhibition stall": { code: "TRADE", icon: "calendar", color: "#9c27b0", description: "Lead from a trade show or exhibition" },
};

const clean = (v?: string | null, max = 200) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

@Injectable()
export class LeadSourcesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** The first time the list is asked for, it is filled with the channels the CRM has always offered. */
  private async seeded() {
    if ((await this.prisma.leadSource.count()) > 0) return;
    await this.prisma.leadSource.createMany({
      data: DEFAULT_CHANNELS.map((name, i) => ({ name, sortOrder: i + 1, ...(STARTERS[name] ?? {}) })),
      skipDuplicates: true,
    });
  }

  async list(opts: { includeInactive?: boolean } = {}) {
    await this.seeded();
    const rows = await this.prisma.leadSource.findMany({
      where: opts.includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    // How many leads carry each source's name, so the screen can say what deleting would affect.
    const used = await this.prisma.lead.groupBy({ by: ["channel"], _count: { _all: true }, where: { channel: { not: null } } });
    const counts = new Map(used.map((u) => [u.channel, u._count._all]));
    return rows.map((r) => ({ ...r, leadCount: counts.get(r.name) ?? 0 }));
  }

  /** Just the names of the sources on offer, in order: what the lead forms suggest. */
  async activeNames() {
    return (await this.list()).map((r) => r.name);
  }

  private async nextOrder() {
    const last = await this.prisma.leadSource.aggregate({ _max: { sortOrder: true } });
    return (last._max.sortOrder ?? 0) + 1;
  }

  async create(dto: CreateLeadSourceDto, actor: AuthUser, ip?: string) {
    await this.seeded();
    try {
      const row = await this.prisma.leadSource.create({
        data: {
          name: dto.name.trim(),
          code: clean(dto.code, 20)?.toUpperCase() ?? null,
          description: clean(dto.description),
          icon: clean(dto.icon, 40),
          color: dto.color ?? "#6B7280",
          sortOrder: dto.sortOrder ?? (await this.nextOrder()),
          active: dto.active ?? true,
        },
      });
      await this.audit.record({ actor, action: AuditAction.CREATE, entity: "LeadSource", entityId: row.id, entityLabel: row.name, ip });
      return row;
    } catch (e) {
      throw this.conflict(e);
    }
  }

  async update(id: string, dto: UpdateLeadSourceDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Lead source not found");
    try {
      const row = await this.prisma.leadSource.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.code !== undefined && { code: clean(dto.code, 20)?.toUpperCase() ?? null }),
          ...(dto.description !== undefined && { description: clean(dto.description) }),
          ...(dto.icon !== undefined && { icon: clean(dto.icon, 40) }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.active !== undefined && { active: dto.active }),
        },
      });
      await this.audit.record({
        actor,
        action: AuditAction.UPDATE,
        entity: "LeadSource",
        entityId: row.id,
        entityLabel: row.name,
        changes: diff(before, row),
        ip,
      });
      return row;
    } catch (e) {
      throw this.conflict(e);
    }
  }

  /** A source that leads already carry is switched off instead of deleted, so reports keep their history. */
  async remove(id: string, actor: AuthUser, ip?: string) {
    const row = await this.prisma.leadSource.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Lead source not found");
    const used = await this.prisma.lead.count({ where: { channel: row.name } });
    if (used > 0) {
      throw new ConflictException(`${used} lead${used === 1 ? "" : "s"} came from "${row.name}". Switch it off instead of deleting it, so those leads keep their source.`);
    }
    await this.prisma.leadSource.delete({ where: { id } });
    await this.audit.record({ actor, action: AuditAction.DELETE, entity: "LeadSource", entityId: id, entityLabel: row.name, ip });
    return { ok: true };
  }

  private conflict(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const field = String((e.meta as { target?: string[] } | undefined)?.target ?? "");
      return new ConflictException(field.includes("code") ? "That code is already used by another lead source." : "A lead source with that name already exists.");
    }
    return e;
  }
}
