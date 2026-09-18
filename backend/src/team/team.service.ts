import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { AuditService, diff } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateUserDto, UpdateUserDto } from "./dto/team.dto";

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  designation: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class TeamService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

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

  async create(dto: CreateUserDto, actor: AuthUser, ip?: string) {
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

    const data = { ...dto, ...(dto.email && { email: dto.email.toLowerCase() }) };
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
