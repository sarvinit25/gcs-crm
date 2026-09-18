import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, LeadStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreatePartnerDto, UpdatePartnerDto } from "./dto/partner.dto";

const ROSTER_SELECT = {
  id: true,
  name: true,
  firm: true,
  phone: true,
  email: true,
  city: true,
  commissionRate: true,
  active: true,
  createdAt: true,
  passwordHash: true,
} as const;

/** Never send the hash to the client — only whether portal access is set up. */
const withPortalFlag = <T extends { passwordHash: string | null }>({
  passwordHash,
  ...rest
}: T) => ({ ...rest, hasPortalAccess: passwordHash !== null });

@Injectable()
export class PartnersService {
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

  /** Names for the referral dropdown on a lead — any signed-in user may read it. */
  findAssignable() {
    return this.prisma.sourcingPartner.findMany({
      where: { active: true },
      select: { id: true, name: true, firm: true, commissionRate: true },
      orderBy: { name: "asc" },
    });
  }

  /**
   * The roster, with each partner's referral record alongside it — a commission
   * rate means little without knowing what the partner actually brings in.
   */
  async findAll(includeInactive: boolean) {
    const partners = await this.prisma.sourcingPartner.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: ROSTER_SELECT,
    });

    const [leadCounts, convertedCounts] = await this.prisma.$transaction([
      this.prisma.lead.groupBy({
        by: ["sourcingPartnerId"],
        where: { sourcingPartnerId: { not: null } },
        _count: true,
        orderBy: { sourcingPartnerId: "asc" },
      }),
      this.prisma.lead.groupBy({
        by: ["sourcingPartnerId"],
        where: { sourcingPartnerId: { not: null }, status: LeadStatus.CONVERTED },
        _count: true,
        orderBy: { sourcingPartnerId: "asc" },
      }),
    ]);

    const leads = new Map(leadCounts.map((r) => [r.sourcingPartnerId, r._count]));
    const converted = new Map(convertedCounts.map((r) => [r.sourcingPartnerId, r._count]));

    return partners.map((p) => ({
      ...withPortalFlag(p),
      leadCount: leads.get(p.id) ?? 0,
      convertedCount: converted.get(p.id) ?? 0,
    }));
  }

  async create(dto: CreatePartnerDto, actor: AuthUser, ip?: string) {
    const existing = await this.prisma.sourcingPartner.findFirst({ where: { phone: dto.phone } });
    if (existing) {
      throw new BadRequestException(`${existing.name} is already registered on this number`);
    }

    const { password, ...rest } = dto;
    if (password) this.assertPasswordPolicy(password);

    const partner = await this.prisma.sourcingPartner.create({
      data: { ...rest, passwordHash: password ? await bcrypt.hash(password, 10) : undefined },
      select: ROSTER_SELECT,
    });

    await this.audit.record({
      actor,
      action: AuditAction.CREATE,
      entity: "SourcingPartner",
      entityId: partner.id,
      entityLabel: partner.name,
      changes: {
        commissionRate: { from: null, to: dto.commissionRate },
        portalAccess: { from: null, to: Boolean(password) },
      },
      ip,
    });

    return withPortalFlag(partner);
  }

  async setPassword(id: string, password: string, actor: AuthUser, ip?: string) {
    this.assertPasswordPolicy(password);
    const partner = await this.prisma.sourcingPartner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException("Sourcing partner not found");

    await this.prisma.sourcingPartner.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });

    // The password itself is never recorded — only that portal access was set.
    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "SourcingPartner",
      entityId: id,
      entityLabel: partner.name,
      changes: { portalAccess: { from: partner.passwordHash !== null, to: true } },
      ip,
    });

    return { ok: true };
  }

  async update(id: string, dto: UpdatePartnerDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.sourcingPartner.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Sourcing partner not found");

    const partner = await this.prisma.sourcingPartner.update({
      where: { id },
      data: { ...dto },
      select: ROSTER_SELECT,
    });

    // A rate change decides what this partner is paid on every case that follows.
    await this.audit.recordUpdate({
      actor,
      entity: "SourcingPartner",
      entityId: id,
      entityLabel: partner.name,
      changes: diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
      ip,
    });

    return withPortalFlag(partner);
  }

  async findOne(id: string) {
    const partner = await this.prisma.sourcingPartner.findUnique({
      where: { id },
      include: {
        leads: {
          select: {
            id: true,
            leadNo: true,
            name: true,
            status: true,
            createdAt: true,
            loanProduct: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });
    if (!partner) throw new NotFoundException("Sourcing partner not found");
    const { passwordHash, ...rest } = partner;
    return { ...rest, hasPortalAccess: passwordHash !== null };
  }
}
