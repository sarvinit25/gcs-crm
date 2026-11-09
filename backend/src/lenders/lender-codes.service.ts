import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateLenderCodeDto, UpdateLenderCodeDto } from "./dto/lender-code.dto";

/** What GCS earns from a lender is for admins and managers; advisors still see the code they log in with. */
export function seesPayout(user: AuthUser) {
  return user.role === Role.ADMIN || user.role === Role.MANAGER;
}

export function shapeCode<T extends { payoutText: string | null; payoutPercent: unknown }>(code: T, user: AuthUser) {
  return seesPayout(user) ? code : { ...code, payoutText: null, payoutPercent: null };
}

@Injectable()
export class LenderCodesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async forLender(lenderId: string, user: AuthUser) {
    const rows = await this.prisma.lenderCode.findMany({
      where: { lenderId },
      include: { loanProduct: { select: { id: true, name: true } } },
      orderBy: [{ active: "desc" }, { product: "asc" }, { code: "asc" }],
    });
    return rows.map((r) => shapeCode(r, user));
  }

  async create(dto: CreateLenderCodeDto, actor: AuthUser, ip?: string) {
    const lender = await this.prisma.lender.findUnique({ where: { id: dto.lenderId } });
    if (!lender) throw new NotFoundException("Lender not found");
    const row = await this.prisma.lenderCode.create({ data: { ...dto, source: "Added in the CRM" }, include: { loanProduct: { select: { id: true, name: true } } } });
    await this.audit.record({ actor, action: AuditAction.CREATE, entity: "LenderCode", entityId: row.id, entityLabel: `${lender.name} · ${row.product}`, ip });
    return row;
  }

  async update(id: string, dto: UpdateLenderCodeDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.lenderCode.findUnique({ where: { id }, include: { lender: { select: { name: true } } } });
    if (!before) throw new NotFoundException("Code not found");
    const row = await this.prisma.lenderCode.update({ where: { id }, data: { ...dto }, include: { loanProduct: { select: { id: true, name: true } } } });
    await this.audit.recordUpdate({
      actor, entity: "LenderCode", entityId: id, entityLabel: `${before.lender.name} · ${row.product}`,
      changes: diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>), ip,
    });
    return row;
  }

  async remove(id: string, actor: AuthUser, ip?: string) {
    const before = await this.prisma.lenderCode.findUnique({ where: { id }, include: { lender: { select: { name: true } } } });
    if (!before) throw new NotFoundException("Code not found");
    await this.prisma.lenderCode.delete({ where: { id } });
    await this.audit.record({ actor, action: AuditAction.DELETE, entity: "LenderCode", entityId: id, entityLabel: `${before.lender.name} · ${before.product}`, ip });
    return { ok: true };
  }
}
