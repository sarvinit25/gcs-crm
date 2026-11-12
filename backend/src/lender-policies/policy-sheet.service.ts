import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { cleanSheet, fillSheet, SHEET_SECTIONS, sheetProgress, type SheetData } from "./policy-sheet-schema";

/** The lender's policy one-pager: read it, correct it by hand, or have a flyer fill in what it finds. */
@Injectable()
export class PolicySheetService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async lender(id: string) {
    const l = await this.prisma.lender.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!l) throw new NotFoundException("Lender not found");
    return l;
  }

  async get(lenderId: string) {
    const lender = await this.lender(lenderId);
    const row = await this.prisma.lenderPolicySheet.findUnique({ where: { lenderId } });
    const data = cleanSheet(row?.data);
    return { lender, sections: SHEET_SECTIONS, data, progress: sheetProgress(data), source: row?.source ?? null, updatedAt: row?.updatedAt ?? null, updatedByName: row?.updatedByName ?? null };
  }

  /** A person's edit replaces the sheet, so clearing a field really clears it. Unknown or unusable values are dropped. */
  async save(lenderId: string, body: unknown, actor: AuthUser, ip?: string) {
    const lender = await this.lender(lenderId);
    const data = cleanSheet((body as { data?: unknown } | null)?.data);
    await this.prisma.lenderPolicySheet.upsert({
      where: { lenderId },
      create: { lenderId, data: data as Prisma.InputJsonValue, source: "Entered by hand", updatedByName: actor.name },
      update: { data: data as Prisma.InputJsonValue, updatedByName: actor.name },
    });
    await this.audit.record({ actor, action: AuditAction.UPDATE, entity: "Lender", entityId: lenderId, entityLabel: `${lender.name} · policy one-pager`, ip });
    return this.get(lenderId);
  }

  /** What a flyer found is added to the sheet, blanks only: nothing already held is overwritten. */
  async fillFrom(lenderId: string, found: SheetData, source: string, actor: AuthUser, ip?: string) {
    const row = await this.prisma.lenderPolicySheet.findUnique({ where: { lenderId } });
    const { data, filled, differs } = fillSheet(cleanSheet(row?.data), cleanSheet(found));
    if (!filled.length) return { filled, differs };
    await this.prisma.lenderPolicySheet.upsert({
      where: { lenderId },
      create: { lenderId, data: data as Prisma.InputJsonValue, source, updatedByName: actor.name },
      update: { data: data as Prisma.InputJsonValue, source, updatedByName: actor.name },
    });
    const lender = await this.lender(lenderId);
    await this.audit.record({ actor, action: AuditAction.UPDATE, entity: "Lender", entityId: lenderId, entityLabel: `${lender.name} · policy one-pager filled from a flyer`, ip });
    return { filled, differs };
  }
}
