import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from "./dto/document-type.dto";

const clean = (v?: string | null, max = 300) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

const INCLUDE = { loanProducts: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" as const } } };

@Injectable()
export class DocumentTypesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  /** The folders documents are filed under (Settings → Documents), which the checklist matches uploads against. */
  categories() {
    return this.settings.get<string[]>("documents.categories");
  }

  private checkCategory(category: string) {
    if (!this.categories().includes(category)) {
      throw new BadRequestException(`"${category}" is not one of the document categories. Pick one from the list.`);
    }
  }

  list() {
    return this.prisma.documentType.findMany({
      include: INCLUDE,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  private async nextOrder() {
    const last = await this.prisma.documentType.aggregate({ _max: { sortOrder: true } });
    return (last._max.sortOrder ?? 0) + 1;
  }

  /** Rejects ids that are not loan types, so a stale form cannot silently link nothing. */
  private async loanProductLinks(ids: string[] | undefined) {
    const unique = [...new Set(ids ?? [])];
    if (unique.length) {
      const found = await this.prisma.loanProduct.count({ where: { id: { in: unique } } });
      if (found !== unique.length) throw new BadRequestException("One of the selected loan types no longer exists.");
    }
    return unique.map((id) => ({ id }));
  }

  async create(dto: CreateDocumentTypeDto, actor: AuthUser, ip?: string) {
    this.checkCategory(dto.category);
    const links = await this.loanProductLinks(dto.loanProductIds);
    try {
      const row = await this.prisma.documentType.create({
        data: {
          name: dto.name.trim(),
          category: dto.category,
          code: clean(dto.code, 30)?.toUpperCase() ?? null,
          description: clean(dto.description),
          applicantTypes: [...new Set(dto.applicantTypes ?? [])],
          loanProducts: { connect: links },
          sortOrder: dto.sortOrder ?? (await this.nextOrder()),
          active: dto.active ?? true,
        },
        include: INCLUDE,
      });
      await this.audit.record({ actor, action: AuditAction.CREATE, entity: "DocumentType", entityId: row.id, entityLabel: row.name, ip });
      return row;
    } catch (e) {
      throw this.conflict(e);
    }
  }

  async update(id: string, dto: UpdateDocumentTypeDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.documentType.findUnique({ where: { id }, include: INCLUDE });
    if (!before) throw new NotFoundException("Document type not found");
    if (dto.category !== undefined && dto.category !== before.category) this.checkCategory(dto.category);
    const links = dto.loanProductIds !== undefined ? await this.loanProductLinks(dto.loanProductIds) : undefined;
    try {
      const row = await this.prisma.documentType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.code !== undefined && { code: clean(dto.code, 30)?.toUpperCase() ?? null }),
          ...(dto.description !== undefined && { description: clean(dto.description) }),
          ...(dto.applicantTypes !== undefined && { applicantTypes: [...new Set(dto.applicantTypes)] }),
          ...(links && { loanProducts: { set: links } }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.active !== undefined && { active: dto.active }),
        },
        include: INCLUDE,
      });
      const names = (r: typeof row) => r.loanProducts.map((p) => p.name).join(", ") || "All loan types";
      await this.audit.record({
        actor,
        action: AuditAction.UPDATE,
        entity: "DocumentType",
        entityId: row.id,
        entityLabel: row.name,
        changes: {
          ...diff(
            { ...before, loanProducts: undefined, applicantTypes: before.applicantTypes.join(", ") },
            { ...row, loanProducts: undefined, applicantTypes: row.applicantTypes.join(", ") },
          ),
          ...(names(before) !== names(row) && { loanTypes: { from: names(before), to: names(row) } }),
        },
        ip,
      });
      return row;
    } catch (e) {
      throw this.conflict(e);
    }
  }

  /** Nothing else points at a document type (uploads are filed by category), so deleting is safe; switching off keeps it for later. */
  async remove(id: string, actor: AuthUser, ip?: string) {
    const row = await this.prisma.documentType.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Document type not found");
    await this.prisma.documentType.delete({ where: { id } });
    await this.audit.record({ actor, action: AuditAction.DELETE, entity: "DocumentType", entityId: id, entityLabel: row.name, ip });
    return { ok: true };
  }

  private conflict(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const field = String((e.meta as { target?: string[] } | undefined)?.target ?? "");
      return new ConflictException(field.includes("code") ? "That code is already used by another document type." : "That document already exists under this category.");
    }
    return e;
  }
}
