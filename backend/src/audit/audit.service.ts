import { Injectable, Logger } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

type RecordArgs = {
  actor: AuthUser | { id?: string; name: string };
  action: AuditAction;
  entity: string;
  entityId: string;
  entityLabel?: string;
  changes?: FieldChanges;
  ip?: string;
};

/** Values Prisma hands back that JSON would otherwise mangle. */
const normalise = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  return value ?? null;
};

/**
 * Field-level diff between what a record held and what a caller is setting.
 * Only keys present in `after` are considered, so a partial update doesn't
 * report every untouched column as a change.
 */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldChanges | undefined {
  const changes: FieldChanges = {};

  for (const [key, rawNext] of Object.entries(after)) {
    if (rawNext === undefined) continue;

    const prev = normalise(before[key]);
    const next = normalise(rawNext);
    // Compare loosely via JSON so Decimal("100") and "100" don't read as a change.
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changes[key] = { from: prev, to: next };
    }
  }

  return Object.keys(changes).length ? changes : undefined;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Writes an audit row. Deliberately never throws — an audit failure must not
   * roll back or block the business action the user actually asked for.
   */
  async record({ actor, action, entity, entityId, entityLabel, changes, ip }: RecordArgs) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor.id,
          actorName: actor.name,
          action,
          entity,
          entityId,
          entityLabel,
          changes: changes as Prisma.InputJsonValue,
          ip,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log for ${entity}:${entityId} — ${String(err)}`);
    }
  }

  /** Skips the write entirely when an update turned out to change nothing. */
  async recordUpdate(args: Omit<RecordArgs, "action">) {
    if (!args.changes) return;
    await this.record({ ...args, action: AuditAction.UPDATE });
  }

  async findAll(query: {
    entity?: string;
    entityId?: string;
    actorId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);

    const where: Prisma.AuditLogWhereInput = {
      ...(query.entity && { entity: query.entity }),
      ...(query.entityId && { entityId: query.entityId }),
      ...(query.actorId && { actorId: query.actorId }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}
