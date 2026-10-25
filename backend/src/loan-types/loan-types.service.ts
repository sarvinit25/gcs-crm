import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateLoanTypeDto, UpdateLoanTypeDto } from "./dto/loan-type.dto";

const clean = (v?: string | null, max = 200) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

@Injectable()
export class LoanTypesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Every loan type with how many files, leads and documents lean on it. */
  async list() {
    const [rows, apps, leads] = await Promise.all([
      this.prisma.loanProduct.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { documentTypes: true, lenderPolicies: true } } },
      }),
      this.prisma.application.groupBy({ by: ["loanProductId"], _count: { _all: true }, orderBy: { loanProductId: "asc" } }),
      this.prisma.lead.groupBy({ by: ["loanProductId"], _count: { _all: true }, orderBy: { loanProductId: "asc" } }),
    ]);
    const appCount = new Map(apps.map((a) => [a.loanProductId, a._count._all]));
    const leadCount = new Map(leads.map((l) => [l.loanProductId, l._count._all]));
    return rows.map(({ _count, ...r }) => ({
      ...r,
      applicationCount: appCount.get(r.id) ?? 0,
      leadCount: leadCount.get(r.id) ?? 0,
      documentTypeCount: _count.documentTypes,
      policyCount: _count.lenderPolicies,
    }));
  }

  private async nextOrder() {
    const last = await this.prisma.loanProduct.aggregate({ _max: { sortOrder: true } });
    return (last._max.sortOrder ?? 0) + 1;
  }

  private checkRange(min?: number | null, max?: number | null) {
    if (min != null && max != null && min > max) {
      throw new BadRequestException("The smallest loan amount cannot be more than the largest.");
    }
  }

  async create(dto: CreateLoanTypeDto, actor: AuthUser, ip?: string) {
    this.checkRange(dto.minAmount, dto.maxAmount);
    try {
      const row = await this.prisma.loanProduct.create({
        data: {
          name: dto.name.trim(),
          slug: dto.slug,
          code: clean(dto.code, 30)?.toUpperCase() ?? null,
          category: clean(dto.category, 80),
          description: clean(dto.description),
          icon: clean(dto.icon, 40),
          color: dto.color ?? "#6B7280",
          secured: dto.secured ?? false,
          minAmount: dto.minAmount ?? null,
          maxAmount: dto.maxAmount ?? null,
          sortOrder: dto.sortOrder ?? (await this.nextOrder()),
          active: dto.active ?? true,
        },
      });
      await this.audit.record({ actor, action: AuditAction.CREATE, entity: "LoanProduct", entityId: row.id, entityLabel: row.name, ip });
      return row;
    } catch (e) {
      throw this.conflict(e);
    }
  }

  async update(id: string, dto: UpdateLoanTypeDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.loanProduct.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Loan type not found");
    this.checkRange(
      dto.minAmount !== undefined ? dto.minAmount : before.minAmount?.toNumber(),
      dto.maxAmount !== undefined ? dto.maxAmount : before.maxAmount?.toNumber(),
    );
    try {
      const row = await this.prisma.loanProduct.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.slug !== undefined && { slug: dto.slug }),
          ...(dto.code !== undefined && { code: clean(dto.code, 30)?.toUpperCase() ?? null }),
          ...(dto.category !== undefined && { category: clean(dto.category, 80) }),
          ...(dto.description !== undefined && { description: clean(dto.description) }),
          ...(dto.icon !== undefined && { icon: clean(dto.icon, 40) }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.secured !== undefined && { secured: dto.secured }),
          ...(dto.minAmount !== undefined && { minAmount: dto.minAmount }),
          ...(dto.maxAmount !== undefined && { maxAmount: dto.maxAmount }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.active !== undefined && { active: dto.active }),
        },
      });
      await this.audit.record({
        actor,
        action: AuditAction.UPDATE,
        entity: "LoanProduct",
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

  /** A loan type that leads or files already carry is switched off instead of deleted, so their history stays whole. */
  async remove(id: string, actor: AuthUser, ip?: string) {
    const row = await this.prisma.loanProduct.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Loan type not found");
    const [apps, leads, policies] = await Promise.all([
      this.prisma.application.count({ where: { loanProductId: id } }),
      this.prisma.lead.count({ where: { loanProductId: id } }),
      this.prisma.lenderPolicy.count({ where: { loanProductId: id } }),
    ]);
    if (apps + leads + policies > 0) {
      const parts = [
        apps && `${apps} file${apps === 1 ? "" : "s"}`,
        leads && `${leads} lead${leads === 1 ? "" : "s"}`,
        policies && `${policies} lender polic${policies === 1 ? "y" : "ies"}`,
      ].filter(Boolean);
      throw new ConflictException(`"${row.name}" is used by ${parts.join(", ")}. Switch it off instead of deleting it, so that history stays intact.`);
    }
    await this.prisma.loanProduct.delete({ where: { id } });
    await this.audit.record({ actor, action: AuditAction.DELETE, entity: "LoanProduct", entityId: id, entityLabel: row.name, ip });
    return { ok: true };
  }

  private conflict(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const field = String((e.meta as { target?: string[] } | undefined)?.target ?? "");
      if (field.includes("code")) return new ConflictException("That code is already used by another loan type.");
      if (field.includes("slug")) return new ConflictException("That web address name (slug) is already used by another loan type.");
      return new ConflictException("A loan type with that name already exists.");
    }
    return e;
  }
}
