import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import {
  CreateFollowUpDto,
  CreateLeadDto,
  ListLeadsQuery,
  PublicLeadDto,
  UpdateLeadDto,
} from "./dto/lead.dto";

const LIST_INCLUDE = {
  loanProduct: { select: { id: true, name: true, slug: true } },
  assignedOfficer: { select: { id: true, name: true } },
  assignedManager: { select: { id: true, name: true } },
  sourcingPartner: { select: { id: true, name: true } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  /** Advisors only ever see their own leads; managers and admins see everything. */
  private scopeFor(user: AuthUser): Prisma.LeadWhereInput {
    return user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {};
  }

  private async resolveProductId(slug?: string) {
    if (!slug) return undefined;
    const product = await this.prisma.loanProduct.findUnique({ where: { slug } });
    return product?.id;
  }

  /** Intake from the public website, WhatsApp flow and AI telecaller. */
  async intake(dto: PublicLeadDto) {
    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone,
        email: dto.email?.trim().toLowerCase(),
        city: dto.city?.trim(),
        source: dto.source,
        loanProductId: await this.resolveProductId(dto.productSlug),
        amount: dto.amount,
        notes: dto.detail,
      },
      select: { id: true, leadNo: true },
    });
    return { id: lead.id, leadNo: lead.leadNo };
  }

  async create(dto: CreateLeadDto, user: AuthUser) {
    return this.prisma.lead.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone,
        email: dto.email?.trim().toLowerCase(),
        city: dto.city?.trim(),
        source: dto.source,
        loanProductId: await this.resolveProductId(dto.productSlug),
        amount: dto.amount,
        notes: dto.detail,
        sourcingPartnerId: dto.sourcingPartnerId,
        // An advisor creating a lead owns it unless someone else is named.
        assignedOfficerId:
          dto.assignedOfficerId ??
          (user.role === Role.ADVISOR && this.settings.get<boolean>("pipeline.autoAssignToCreator")
            ? user.id
            : undefined),
        assignedManagerId: dto.assignedManagerId,
        nextFollowUpAt: dto.nextFollowUpAt,
      },
      include: LIST_INCLUDE,
    });
  }

  async findAll(query: ListLeadsQuery, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    const where: Prisma.LeadWhereInput = {
      ...this.scopeFor(user),
      ...(query.status && { status: query.status }),
      ...(query.source && { source: query.source }),
      ...(query.assignedOfficerId && { assignedOfficerId: query.assignedOfficerId }),
      ...(query.dueOnly === "true" && { nextFollowUpAt: { lte: new Date() } }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, user: AuthUser) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, ...this.scopeFor(user) },
      include: {
        ...LIST_INCLUDE,
        application: { select: { id: true, seq: true, createdAt: true, status: true } },
        followUps: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");

    const { application, ...rest } = lead;
    return {
      ...rest,
      application: application && {
        id: application.id,
        status: application.status,
        applicationNo: this.settings.applicationNo(application.seq, application.createdAt),
      },
    };
  }

  async update(id: string, dto: UpdateLeadDto, user: AuthUser, ip?: string) {
    const before = await this.findOne(id, user);
    const lead = await this.prisma.lead.update({
      where: { id },
      data: { ...dto },
      include: LIST_INCLUDE,
    });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Lead",
      entityId: id,
      entityLabel: `#${lead.leadNo} ${lead.name}`,
      changes: diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
      ip,
    });

    return lead;
  }

  async addFollowUp(id: string, dto: CreateFollowUpDto, user: AuthUser) {
    await this.findOne(id, user);
    const followUp = await this.prisma.followUp.create({
      data: { leadId: id, userId: user.id, note: dto.note, dueAt: dto.dueAt },
      include: { user: { select: { id: true, name: true } } },
    });

    // Logging a dated follow-up is how the next action date gets set.
    if (dto.dueAt) {
      await this.prisma.lead.update({
        where: { id },
        data: { nextFollowUpAt: dto.dueAt },
      });
    }
    return followUp;
  }
}
