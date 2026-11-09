import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateLenderDto, UpdateLenderDto } from "./dto/lender.dto";
import { ListBranchesQuery } from "./dto/lender-code.dto";
import { shapeCode } from "./lender-codes.service";

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

    const codeCounts = new Map((await this.prisma.lenderCode.groupBy({ by: ["lenderId"], _count: true, orderBy: { lenderId: "asc" } })).map((c) => [c.lenderId, c._count]));
    const branchCounts = new Map((await this.prisma.lenderBranch.groupBy({ by: ["lenderId"], _count: true, orderBy: { lenderId: "asc" } })).map((c) => [c.lenderId, c._count]));

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
    // The first active relationship manager (before any regional / branch name) is the one shown.
    const people = await this.prisma.lenderContact.findMany({
      where: { active: true },
      select: { lenderId: true, name: true, phone: true, email: true },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });
    const manager = new Map<string, (typeof people)[number]>();
    for (const c of people) if (!manager.has(c.lenderId)) manager.set(c.lenderId, c);

    return lenders.map((l) => ({
      ...l,
      applicationCount: byLender.get(l.id) ?? 0,
      contactCount: contactsBy.get(l.id) ?? 0,
      codeCount: codeCounts.get(l.id) ?? 0,
      branchCount: branchCounts.get(l.id) ?? 0,
      policyCount: policiesBy.get(l.id)?.all ?? 0,
      activePolicyCount: policiesBy.get(l.id)?.active ?? 0,
      relationshipManager: manager.get(l.id) ?? null,
    }));
  }

  /** One lender with its policies, broker codes and a first few of its people (the rest are paged through /lender-contacts). */
  async findOne(id: string, user: AuthUser) {
    const lender = await this.prisma.lender.findUnique({
      where: { id },
      include: {
        contacts: { where: { active: true }, orderBy: [{ kind: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 5 },
        policies: {
          include: { loanProduct: { select: { id: true, name: true, slug: true } } },
          orderBy: { loanProduct: { name: "asc" } },
        },
        codes: { include: { loanProduct: { select: { id: true, name: true } } }, orderBy: [{ active: "desc" }, { product: "asc" }, { code: "asc" }] },
        _count: { select: { applications: true, branches: true } },
      },
    });
    if (!lender) throw new NotFoundException("Lender not found");
    const contactCount = await this.prisma.lenderContact.count({ where: { lenderId: id, active: true } });
    const { _count, codes, ...rest } = lender;
    return { ...rest, codes: codes.map((c) => shapeCode(c, user)), applicationCount: _count.applications, branchCount: _count.branches, contactCount };
  }

  /** A lender's branches / offices, searchable and paged. */
  async branches(id: string, query: ListBranchesQuery) {
    const words = (query.search ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
    const where: Prisma.LenderBranchWhereInput = {
      lenderId: id,
      ...(query.state && { state: query.state }),
      ...(words.length && {
        AND: words.map((w) => ({
          OR: ["name", "city", "state", "region", "zone", "area", "dsaSourcing"].map((f) => ({ [f]: { contains: w, mode: "insensitive" as const } })),
        })),
      }),
    };
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lenderBranch.findMany({ where, orderBy: [{ state: "asc" }, { name: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
      this.prisma.lenderBranch.count({ where }),
    ]);
    return { items, total, page, limit };
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
