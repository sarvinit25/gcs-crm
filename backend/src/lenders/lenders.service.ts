import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateLenderDto, UpdateLenderDto } from "./dto/lender.dto";

/** Text fields left empty on the form are stored as "nothing", not as an empty string. */
const TEXT = ["shortName", "brokerCode", "portalUrl", "branchName", "branchCity", "branchAddress", "notes"] as const;
function blanks(dto: object) {
  const out: Record<string, string | null> = {};
  for (const k of TEXT) {
    const v = (dto as Record<string, unknown>)[k];
    if (typeof v === "string") out[k] = v.trim() || null;
  }
  return out;
}

@Injectable()
export class LendersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Assignment dropdowns — id and name only. */
  findAssignable() {
    return this.prisma.lender.findMany({
      where: { active: true },
      select: { id: true, name: true, type: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * What the website's partner directory renders. Only lenders explicitly
   * flagged public, so an internal-only lender can be worked with without
   * appearing on a public page.
   */
  findPublic() {
    return this.prisma.lender.findMany({
      where: { active: true, isPublic: true },
      select: { name: true, type: true, logoUrl: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /** The full directory with each lender's live caseload. */
  async findAll(includeInactive: boolean) {
    const lenders = await this.prisma.lender.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
    });

    const counts = await this.prisma.application.groupBy({
      by: ["lenderId"],
      where: { lenderId: { not: null } },
      _count: true,
      orderBy: { lenderId: "asc" },
    });
    const byLender = new Map(counts.map((c) => [c.lenderId, c._count]));
    const contactCounts = await this.prisma.lenderContact.groupBy({
      by: ["lenderId"],
      where: { active: true },
      _count: true,
      orderBy: { lenderId: "asc" },
    });
    const contactsBy = new Map(contactCounts.map((c) => [c.lenderId, c._count]));

    const policies = await this.prisma.lenderPolicy.groupBy({
      by: ["lenderId", "active"],
      _count: true,
      orderBy: { lenderId: "asc" },
    });
    const policiesBy = new Map<string, { all: number; active: number }>();
    for (const p of policies) {
      const cur = policiesBy.get(p.lenderId) ?? { all: 0, active: 0 };
      cur.all += p._count;
      if (p.active) cur.active += p._count;
      policiesBy.set(p.lenderId, cur);
    }
    // The first active contact is the one shown as the relationship manager.
    const people = await this.prisma.lenderContact.findMany({
      where: { active: true },
      select: { lenderId: true, name: true, phone: true, email: true },
      orderBy: [{ createdAt: "asc" }],
    });
    const manager = new Map<string, (typeof people)[number]>();
    for (const c of people) if (!manager.has(c.lenderId)) manager.set(c.lenderId, c);

    return lenders.map((l) => ({
      ...l,
      applicationCount: byLender.get(l.id) ?? 0,
      contactCount: contactsBy.get(l.id) ?? 0,
      policyCount: policiesBy.get(l.id)?.all ?? 0,
      activePolicyCount: policiesBy.get(l.id)?.active ?? 0,
      relationshipManager: manager.get(l.id) ?? null,
    }));
  }

  /** One lender with its policies (what it offers, per loan type) and its people. */
  async findOne(id: string) {
    const lender = await this.prisma.lender.findUnique({
      where: { id },
      include: {
        contacts: { where: { active: true }, orderBy: { createdAt: "asc" } },
        policies: {
          include: { loanProduct: { select: { id: true, name: true, slug: true } } },
          orderBy: { loanProduct: { name: "asc" } },
        },
        _count: { select: { applications: true } },
      },
    });
    if (!lender) throw new NotFoundException("Lender not found");
    const { _count, ...rest } = lender;
    return { ...rest, applicationCount: _count.applications };
  }

  async create(dto: CreateLenderDto, actor: AuthUser, ip?: string) {
    if (await this.prisma.lender.findUnique({ where: { name: dto.name } })) {
      throw new ConflictException("A lender with this name already exists");
    }

    const lender = await this.prisma.lender.create({ data: { ...dto, ...blanks(dto) } });

    await this.audit.record({
      actor,
      action: AuditAction.CREATE,
      entity: "Lender",
      entityId: lender.id,
      entityLabel: lender.name,
      changes: { type: { from: null, to: lender.type } },
      ip,
    });

    return lender;
  }

  async update(id: string, dto: UpdateLenderDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.lender.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Lender not found");

    if (dto.name && dto.name !== before.name) {
      if (await this.prisma.lender.findUnique({ where: { name: dto.name } })) {
        throw new ConflictException("A lender with this name already exists");
      }
    }

    const lender = await this.prisma.lender.update({ where: { id }, data: { ...dto, ...blanks(dto) } });

    await this.audit.recordUpdate({
      actor,
      entity: "Lender",
      entityId: id,
      entityLabel: lender.name,
      changes: diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
      ip,
    });

    return lender;
  }
}
