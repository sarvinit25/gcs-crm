import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { disallowedKeys, isRecordType, resolveColumns, type RecordType } from "./report-catalogue";

const MAX_TEMPLATES_PER_TYPE = 50;

/**
 * Saved column choices for the custom export. Every query is scoped to the signed-in user, so another user's
 * template can't be listed, used, overwritten or deleted: to everyone else it simply doesn't exist (404).
 */
@Injectable()
export class ReportTemplatesService {
  constructor(private prisma: PrismaService) {}

  list(user: AuthUser, type?: string) {
    if (type !== undefined && !isRecordType(type)) throw new BadRequestException("Unknown report type");
    return this.prisma.reportTemplate.findMany({
      where: { userId: user.id, ...(type && { type }) },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, type: true, name: true, columns: true, updatedAt: true },
    });
  }

  /** Saving under a name already used for this register by the same person replaces that template. */
  async save(user: AuthUser, input: { type: string; name: string; columns: string[] }) {
    if (!isRecordType(input.type)) throw new BadRequestException("Unknown report type");
    const type: RecordType = input.type;
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name) throw new BadRequestException("Give the template a name");

    const { unknown, forbidden } = disallowedKeys(type, user.role, input.columns);
    if (forbidden.length) throw new ForbiddenException("Commission columns are for Admin and Manager");
    if (unknown.length) throw new BadRequestException(`Unknown columns: ${unknown.join(", ")}`);
    // Keep the order chosen, drop repeats.
    const columns = resolveColumns(type, user.role, input.columns).map((c) => c.key);
    if (!columns.length) throw new BadRequestException("Pick at least one column");

    const existing = await this.prisma.reportTemplate.findUnique({
      where: { userId_type_name: { userId: user.id, type, name } },
      select: { id: true },
    });
    if (!existing && (await this.prisma.reportTemplate.count({ where: { userId: user.id, type } })) >= MAX_TEMPLATES_PER_TYPE) {
      throw new ConflictException(`You can keep up to ${MAX_TEMPLATES_PER_TYPE} templates for one report — delete one first`);
    }
    return this.prisma.reportTemplate.upsert({
      where: { userId_type_name: { userId: user.id, type, name } },
      create: { userId: user.id, type, name, columns },
      update: { columns },
      select: { id: true, type: true, name: true, columns: true, updatedAt: true },
    });
  }

  async remove(user: AuthUser, id: string) {
    const found = await this.prisma.reportTemplate.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!found) throw new NotFoundException("Template not found");
    await this.prisma.reportTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  /** One of the caller's own templates for the given register — 404 for anyone else's or the wrong register. */
  async mine(user: AuthUser, id: string, type: RecordType) {
    const found = await this.prisma.reportTemplate.findFirst({ where: { id, userId: user.id, type } });
    if (!found) throw new NotFoundException("Template not found");
    return found;
  }
}
