import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, LeadStatus, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { rangeFilter, resolveRange } from "../common/date.util";
import {
  BulkLeadsDto,
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
        employmentType: dto.employmentType,
        monthlyIncome: dto.monthlyIncome,
        meetingMode: dto.meetingMode,
        meetingPlace: dto.meetingPlace,
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
      ...(query.loanProductId && { loanProductId: query.loanProductId }),
      ...(rangeFilter(resolveRange(query)) && { createdAt: rangeFilter(resolveRange(query)) }),
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

    const data: Prisma.LeadUncheckedUpdateInput = { ...dto };
    if (dto.status === LeadStatus.LOST) {
      if (!(dto.lostReason?.trim() || before.lostReason)) {
        throw new BadRequestException("Say why this lead was lost");
      }
    } else if (dto.status && before.status === LeadStatus.LOST) {
      // Reopening a lead: the old reason no longer applies.
      data.lostReason = null;
    }

    const lead = await this.prisma.lead.update({
      where: { id },
      data,
      include: LIST_INCLUDE,
    });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Lead",
      entityId: id,
      entityLabel: `#${lead.leadNo} ${lead.name}`,
      changes: diff(before as unknown as Record<string, unknown>, data as Record<string, unknown>),
      ip,
    });

    return lead;
  }

  /**
   * Bulk import from a spreadsheet. Rows are validated and de-duplicated one by
   * one so a single bad row never sinks the batch; the caller gets a per-row
   * outcome to fix and re-upload.
   */
  async bulkCreate(dto: BulkLeadsDto, user: AuthUser, ip?: string) {
    const products = await this.prisma.loanProduct.findMany({ select: { id: true, slug: true, name: true } });
    const productKey = new Map<string, string>();
    for (const p of products) {
      productKey.set(p.slug.toLowerCase(), p.id);
      productKey.set(p.name.toLowerCase(), p.id);
    }

    const normalisePhone = (raw: string) => raw.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
    const seen = new Set<string>();
    const results: { row: number; name: string; status: "created" | "duplicate" | "invalid"; message?: string }[] = [];
    const owner =
      user.role === Role.ADVISOR && this.settings.get<boolean>("pipeline.autoAssignToCreator") ? user.id : undefined;

    for (const [i, row] of dto.rows.entries()) {
      const line = i + 1;
      const phone = normalisePhone(row.phone);
      if (!/^[6-9]\d{9}$/.test(phone)) {
        results.push({ row: line, name: row.name, status: "invalid", message: "Phone must be a 10-digit Indian mobile number" });
        continue;
      }
      if (row.name.trim().length < 2) {
        results.push({ row: line, name: row.name, status: "invalid", message: "Name is too short" });
        continue;
      }
      let loanProductId: string | undefined;
      if (row.product?.trim()) {
        loanProductId = productKey.get(row.product.trim().toLowerCase());
        if (!loanProductId) {
          results.push({ row: line, name: row.name, status: "invalid", message: `Unknown loan product "${row.product}"` });
          continue;
        }
      }
      if (seen.has(phone) || (await this.prisma.lead.findFirst({ where: { phone }, select: { id: true } }))) {
        results.push({ row: line, name: row.name, status: "duplicate", message: "A lead with this phone already exists" });
        continue;
      }
      seen.add(phone);

      await this.prisma.lead.create({
        data: {
          name: row.name.trim(),
          phone,
          email: row.email?.trim().toLowerCase() || undefined,
          city: row.city?.trim() || undefined,
          amount: row.amount,
          notes: row.notes,
          source: "bulk-upload",
          loanProductId,
          assignedOfficerId: owner,
        },
      });
      results.push({ row: line, name: row.name, status: "created" });
    }

    const created = results.filter((r) => r.status === "created").length;
    if (created) {
      await this.audit.record({
        actor: user,
        action: AuditAction.CREATE,
        entity: "Lead",
        entityId: "bulk-upload",
        entityLabel: `Bulk import — ${created} lead${created === 1 ? "" : "s"}`,
        changes: { imported: { from: null, to: created } },
        ip,
      });
    }

    return {
      created,
      duplicates: results.filter((r) => r.status === "duplicate").length,
      invalid: results.filter((r) => r.status === "invalid").length,
      results: results.filter((r) => r.status !== "created"),
    };
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
