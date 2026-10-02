import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalisePhone } from "../common/phone.util";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateLenderContactDto, ListLenderContactsQuery, UpdateLenderContactDto } from "./dto/lender-contact.dto";

const WITH_LENDER = { lender: { select: { id: true, name: true, type: true } } } satisfies Prisma.LenderContactInclude;

@Injectable()
export class LenderContactsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  async segments() {
    const used = await this.prisma.$queryRaw<{ s: string }[]>`SELECT DISTINCT unnest("segments") AS s FROM "LenderContact"`;
    return [...new Set([...this.settings.get<string[]>("lenders.segments"), ...used.map((u) => u.s)])];
  }

  /** Every word typed must be found somewhere — name, number, email, the bank or a note. */
  list(query: ListLenderContactsQuery) {
    const search = (query.search ?? "").trim();
    // A pasted phone number ("+91 98205 92765") is one thing to look for, not three words.
    const words = /^[\d\s+()-]{6,}$/.test(search)
      ? [normalisePhone(search) ?? search]
      : search.split(/\s+/).filter(Boolean).slice(0, 6);
    const where: Prisma.LenderContactWhereInput = {
      ...(query.includeInactive === "true" ? {} : { active: true }),
      ...(query.lenderId && { lenderId: query.lenderId }),
      ...(query.segment && { segments: { has: query.segment } }),
      ...(words.length && {
        AND: words.map((w) => ({
          OR: [
            { name: { contains: w, mode: "insensitive" as const } },
            { phone: { contains: w.replace(/\D/g, "") || w } },
            { email: { contains: w, mode: "insensitive" as const } },
            { designation: { contains: w, mode: "insensitive" as const } },
            { notes: { contains: w, mode: "insensitive" as const } },
            { segments: { has: w } },
            { lender: { name: { contains: w, mode: "insensitive" as const } } },
          ],
        })),
      }),
    };
    return this.prisma.lenderContact.findMany({
      where,
      include: WITH_LENDER,
      orderBy: [{ lender: { name: "asc" } }, { name: "asc" }],
      take: 500,
    });
  }

  async create(dto: CreateLenderContactDto, actor: AuthUser, ip?: string) {
    const lender = await this.prisma.lender.findUnique({ where: { id: dto.lenderId } });
    if (!lender) throw new NotFoundException("Lender not found");
    if (dto.phone) {
      const clash = await this.prisma.lenderContact.findFirst({ where: { lenderId: dto.lenderId, phone: dto.phone } });
      if (clash) throw new ConflictException(`${clash.name} at ${lender.name} already has this number`);
    }
    const contact = await this.prisma.lenderContact.create({
      data: { ...dto, designation: dto.designation || null, segments: dto.segments ?? [] },
      include: WITH_LENDER,
    });
    await this.audit.record({
      actor,
      action: AuditAction.CREATE,
      entity: "LenderContact",
      entityId: contact.id,
      entityLabel: `${contact.name} · ${lender.name}`,
      ip,
    });
    return contact;
  }

  async update(id: string, dto: UpdateLenderContactDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.lenderContact.findUnique({ where: { id }, include: WITH_LENDER });
    if (!before) throw new NotFoundException("Contact not found");
    if (dto.phone && dto.phone !== before.phone) {
      const clash = await this.prisma.lenderContact.findFirst({ where: { lenderId: before.lenderId, phone: dto.phone, id: { not: id } } });
      if (clash) throw new ConflictException(`${clash.name} at ${before.lender.name} already has this number`);
    }
    const contact = await this.prisma.lenderContact.update({ where: { id }, data: { ...dto }, include: WITH_LENDER });
    await this.audit.recordUpdate({
      actor,
      entity: "LenderContact",
      entityId: id,
      entityLabel: `${contact.name} · ${contact.lender.name}`,
      changes: diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
      ip,
    });
    return contact;
  }

  async remove(id: string, actor: AuthUser, ip?: string) {
    const before = await this.prisma.lenderContact.findUnique({ where: { id }, include: WITH_LENDER });
    if (!before) throw new NotFoundException("Contact not found");
    await this.prisma.lenderContact.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: AuditAction.DELETE,
      entity: "LenderContact",
      entityId: id,
      entityLabel: `${before.name} · ${before.lender.name}`,
      ip,
    });
    return { ok: true };
  }
}
