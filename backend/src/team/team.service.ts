import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateUserDto, UpdateUserDto } from "./dto/team.dto";
import { istToday } from "../common/date.util";

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  designation: true,
  active: true,
  createdAt: true,
  employeeCode: true,
  dateOfBirth: true,
  joinedAt: true,
  commissionPercent: true,
  reportsToId: true,
  reportsTo: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class TeamService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  private assertPasswordPolicy(password: string) {
    const min = this.settings.get<number>("security.minPasswordLength");
    if (password.length < min) {
      throw new BadRequestException(`Password must be at least ${min} characters`);
    }
  }

  /** Assignment dropdowns need this, so any signed-in user may read it. */
  findAssignable() {
    return this.prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, designation: true },
      orderBy: { name: "asc" },
    });
  }

  findAll(includeInactive: boolean) {
    return this.prisma.user.findMany({
      where: includeInactive ? {} : { active: true },
      select: PUBLIC_FIELDS,
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
  }

  private async nextEmployeeCode() {
    const codes = await this.prisma.user.findMany({
      where: { employeeCode: { not: null } },
      select: { employeeCode: true },
    });
    const max = codes.reduce((m, c) => Math.max(m, Number(c.employeeCode!.split("-").pop()) || 0), 0);
    return `GCS-EMP-${String(max + 1).padStart(3, "0")}`;
  }

  /** A reporting line that loops back on itself would make the hierarchy unresolvable. */
  private async assertNoReportingLoop(id: string, reportsToId: string) {
    if (reportsToId === id) throw new BadRequestException("A staff member cannot report to themselves");
    let cursor: string | null = reportsToId;
    for (let hops = 0; cursor && hops < 50; hops++) {
      if (cursor === id) throw new BadRequestException("That reporting line would create a loop");
      const next: { reportsToId: string | null } | null = await this.prisma.user.findUnique({
        where: { id: cursor },
        select: { reportsToId: true },
      });
      cursor = next?.reportsToId ?? null;
    }
  }

  async create(dto: CreateUserDto, actor: AuthUser, ip?: string) {
    this.assertPasswordPolicy(dto.password);
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException("A staff member with this email already exists");
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone,
        role: dto.role,
        designation: dto.designation,
        employeeCode: await this.nextEmployeeCode(),
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        joinedAt: new Date(dto.joinedAt ?? istToday()),
        commissionPercent: dto.commissionPercent,
        reportsToId: dto.reportsToId || undefined,
        passwordHash: await AuthService.hashPassword(dto.password),
      },
      select: PUBLIC_FIELDS,
    });

    await this.audit.record({
      actor,
      action: AuditAction.CREATE,
      entity: "User",
      entityId: user.id,
      entityLabel: user.name,
      changes: { role: { from: null, to: user.role } },
      ip,
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
    if (!before) throw new NotFoundException("Staff member not found");

    // Locking yourself out, or demoting yourself out of admin, needs another admin.
    if (id === actor.id) {
      if (dto.active === false) throw new BadRequestException("You cannot deactivate your own account");
      if (dto.role && dto.role !== Role.ADMIN) {
        throw new BadRequestException("You cannot change your own role away from admin");
      }
    }

    if (dto.email && dto.email.toLowerCase() !== before.email) {
      const clash = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
      if (clash) throw new ConflictException("A staff member with this email already exists");
    }

    if (dto.reportsToId) await this.assertNoReportingLoop(id, dto.reportsToId);

    const { dateOfBirth, joinedAt, reportsToId, ...rest } = dto;
    const data = {
      ...rest,
      ...(dto.email && { email: dto.email.toLowerCase() }),
      ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
      ...(joinedAt !== undefined && { joinedAt: joinedAt ? new Date(joinedAt) : null }),
      ...(reportsToId !== undefined && { reportsToId: reportsToId || null }),
    };
    const user = await this.prisma.user.update({ where: { id }, data, select: PUBLIC_FIELDS });

    await this.audit.recordUpdate({
      actor,
      entity: "User",
      entityId: id,
      entityLabel: user.name,
      changes: diff(before, data),
      ip,
    });

    return user;
  }

  async resetPassword(id: string, password: string, actor: AuthUser, ip?: string) {
    this.assertPasswordPolicy(password);
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
    if (!user) throw new NotFoundException("Staff member not found");

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await AuthService.hashPassword(password) },
    });

    // The new password is never recorded — only the fact that it was reset.
    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "User",
      entityId: id,
      entityLabel: user.name,
      changes: { password: { from: "«hidden»", to: "«reset»" } },
      ip,
    });

    return { ok: true };
  }
}
