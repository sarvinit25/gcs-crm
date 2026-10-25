import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateTeamDto, UpdateTeamDto } from "./dto/team.dto";

const INCLUDE = {
  lead: { select: { id: true, name: true } },
  members: { select: { id: true, name: true, role: true }, where: { active: true }, orderBy: { name: "asc" as const } },
};

@Injectable()
export class TeamsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  list() {
    return this.prisma.team.findMany({ include: INCLUDE, orderBy: [{ active: "desc" }, { name: "asc" }] });
  }

  /** Everyone named must be an active staff member; the team lead is always one of the members. */
  private async people(memberIds: string[] | undefined, leadId: string | null | undefined) {
    const ids = [...new Set([...(memberIds ?? []), ...(leadId ? [leadId] : [])])];
    if (ids.length) {
      const found = await this.prisma.user.count({ where: { id: { in: ids }, active: true } });
      if (found !== ids.length) throw new BadRequestException("One of the selected people is not an active staff member.");
    }
    return ids;
  }

  async create(dto: CreateTeamDto, actor: AuthUser, ip?: string) {
    const ids = await this.people(dto.memberIds, dto.leadId);
    try {
      const team = await this.prisma.$transaction(async (tx) => {
        const created = await tx.team.create({
          data: { name: dto.name.trim(), description: dto.description?.trim() || null, leadId: dto.leadId || null, active: dto.active ?? true },
        });
        // A person works in one team, so anyone picked here leaves the team they were in.
        await tx.user.updateMany({ where: { id: { in: ids } }, data: { teamId: created.id } });
        return created;
      });
      await this.audit.record({ actor, action: AuditAction.CREATE, entity: "Team", entityId: team.id, entityLabel: team.name, changes: { members: { from: null, to: ids.length } }, ip });
      return this.prisma.team.findUniqueOrThrow({ where: { id: team.id }, include: INCLUDE });
    } catch (e) {
      throw this.conflict(e);
    }
  }

  async update(id: string, dto: UpdateTeamDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.team.findUnique({ where: { id }, include: { members: { select: { id: true } } } });
    if (!before) throw new NotFoundException("Team not found");
    const leadId = dto.leadId !== undefined ? dto.leadId : before.leadId;
    const memberIds = dto.memberIds ?? (dto.leadId ? before.members.map((m) => m.id) : undefined);
    const ids = memberIds !== undefined || dto.leadId ? await this.people(memberIds, leadId) : null;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.team.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
            ...(dto.leadId !== undefined && { leadId: dto.leadId || null }),
            ...(dto.active !== undefined && { active: dto.active }),
          },
        });
        if (ids) {
          await tx.user.updateMany({ where: { teamId: id, id: { notIn: ids } }, data: { teamId: null } });
          await tx.user.updateMany({ where: { id: { in: ids } }, data: { teamId: id } });
        }
      });
      const team = await this.prisma.team.findUniqueOrThrow({ where: { id }, include: INCLUDE });
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (team.name !== before.name) changes.name = { from: before.name, to: team.name };
      if (team.active !== before.active) changes.active = { from: before.active, to: team.active };
      if (team.leadId !== before.leadId) changes.teamLead = { from: before.leadId, to: team.leadId };
      if (ids) changes.members = { from: before.members.length, to: team.members.length };
      if (Object.keys(changes).length) await this.audit.recordUpdate({ actor, entity: "Team", entityId: id, entityLabel: team.name, changes, ip });
      return team;
    } catch (e) {
      throw this.conflict(e);
    }
  }

  /** Deleting a team just frees its people; nothing else refers to it. */
  async remove(id: string, actor: AuthUser, ip?: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException("Team not found");
    await this.prisma.team.delete({ where: { id } });
    await this.audit.record({ actor, action: AuditAction.DELETE, entity: "Team", entityId: id, entityLabel: team.name, ip });
    return { ok: true };
  }

  private conflict(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return new ConflictException("A team with that name already exists.");
    return e;
  }
}
