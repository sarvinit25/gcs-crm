import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateLenderDto, UpdateLenderDto } from "./dto/lender.dto";

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

    return lenders.map((l) => ({ ...l, applicationCount: byLender.get(l.id) ?? 0 }));
  }

  async create(dto: CreateLenderDto, actor: AuthUser, ip?: string) {
    if (await this.prisma.lender.findUnique({ where: { name: dto.name } })) {
      throw new ConflictException("A lender with this name already exists");
    }

    const lender = await this.prisma.lender.create({ data: { ...dto } });

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

    const lender = await this.prisma.lender.update({ where: { id }, data: { ...dto } });

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
