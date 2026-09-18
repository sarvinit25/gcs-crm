import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, LeadStatus, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { AuditService, diff } from "../audit/audit.service";
import {
  ApplicantDto,
  CreateApplicationDto,
  ListApplicationsQuery,
  ReferenceDto,
  UpdateApplicationDto,
} from "./dto/application.dto";

/** GCS-2026-0042 — the reference staff and lenders actually quote. */
export const formatApplicationNo = (seq: number, createdAt: Date) =>
  `GCS-${createdAt.getFullYear()}-${String(seq).padStart(4, "0")}`;

const LIST_INCLUDE = {
  loanProduct: { select: { id: true, name: true, slug: true } },
  lender: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  applicants: { where: { isPrimary: true }, take: 1 },
} satisfies Prisma.ApplicationInclude;

type WithSeq = { seq: number; createdAt: Date };

@Injectable()
export class ApplicationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Adds the derived applicationNo the UI and lenders refer to. */
  private decorate<T extends WithSeq>(app: T) {
    return { ...app, applicationNo: formatApplicationNo(app.seq, app.createdAt) };
  }

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  async create(dto: CreateApplicationDto, user: AuthUser) {
    let applicants = dto.applicants ?? [];

    if (dto.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: dto.leadId },
        include: { application: { select: { id: true } } },
      });
      if (!lead) throw new NotFoundException("Lead not found");
      if (lead.application) {
        throw new BadRequestException("This lead already has an application");
      }
      // Seed the primary applicant from the lead so nothing is retyped.
      if (!applicants.length) {
        applicants = [{ name: lead.name, phone: lead.phone, email: lead.email ?? undefined, city: lead.city ?? undefined, isPrimary: true }];
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          leadId: dto.leadId,
          loanProductId: dto.loanProductId,
          requestedAmount: dto.requestedAmount,
          tenureMonths: dto.tenureMonths,
          purpose: dto.purpose,
          lenderId: dto.lenderId,
          ownerId: dto.ownerId ?? user.id,
          applicants: {
            create: applicants.map((a, i) => ({
              ...this.applicantData(a),
              isPrimary: a.isPrimary ?? i === 0,
            })),
          },
          references: { create: (dto.references ?? []).map((r) => this.referenceData(r)) },
        },
        include: LIST_INCLUDE,
      });

      if (dto.leadId) {
        await tx.lead.update({
          where: { id: dto.leadId },
          data: { status: LeadStatus.CONVERTED },
        });
      }
      return app;
    });

    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "Application",
      entityId: created.id,
      entityLabel: formatApplicationNo(created.seq, created.createdAt),
      changes: diff({}, { requestedAmount: dto.requestedAmount, leadId: dto.leadId }),
    });

    return this.decorate(created);
  }

  async findAll(query: ListApplicationsQuery, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);

    // "GCS-2026-0042" and a bare "42" both resolve to the sequence number.
    const seqFromSearch = query.search ? Number(query.search.replace(/^.*-/, "")) : NaN;

    const where: Prisma.ApplicationWhereInput = {
      ...this.scopeFor(user),
      ...(query.status && { status: query.status }),
      ...(query.lenderId && { lenderId: query.lenderId }),
      ...(query.ownerId && { ownerId: query.ownerId }),
      ...(query.search && {
        OR: [
          ...(Number.isFinite(seqFromSearch) ? [{ seq: seqFromSearch }] : []),
          { applicants: { some: { name: { contains: query.search, mode: "insensitive" } } } },
          { applicants: { some: { phone: { contains: query.search } } } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.application.count({ where }),
    ]);

    return { items: items.map((a) => this.decorate(a)), total, page, pageSize };
  }

  async findOne(id: string, user: AuthUser) {
    const app = await this.prisma.application.findFirst({
      where: { id, ...this.scopeFor(user) },
      include: {
        loanProduct: { select: { id: true, name: true, slug: true } },
        lender: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        lead: { select: { id: true, leadNo: true, name: true, source: true } },
        applicants: { orderBy: { isPrimary: "desc" } },
        references: true,
        documents: { orderBy: { createdAt: "desc" } },
        sanction: true,
        disbursements: { orderBy: { disbursedAt: "desc" } },
      },
    });
    if (!app) throw new NotFoundException("Application not found");
    return this.decorate(app);
  }

  async update(id: string, dto: UpdateApplicationDto, user: AuthUser, ip?: string) {
    const before = await this.findOne(id, user);
    const app = await this.prisma.application.update({
      where: { id },
      data: { ...dto },
      include: LIST_INCLUDE,
    });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Application",
      entityId: id,
      entityLabel: formatApplicationNo(app.seq, app.createdAt),
      changes: diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
      ip,
    });

    return this.decorate(app);
  }

  async addApplicant(id: string, dto: ApplicantDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.applicant.create({
      data: { ...this.applicantData(dto), isPrimary: false, applicationId: id },
    });
  }

  async updateApplicant(id: string, applicantId: string, dto: ApplicantDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.applicant.update({
      where: { id: applicantId },
      data: this.applicantData(dto),
    });
  }

  async removeApplicant(id: string, applicantId: string, user: AuthUser) {
    await this.findOne(id, user);
    const applicant = await this.prisma.applicant.findUnique({ where: { id: applicantId } });
    if (!applicant || applicant.applicationId !== id) {
      throw new NotFoundException("Applicant not found on this application");
    }
    if (applicant.isPrimary) {
      throw new BadRequestException("The primary applicant cannot be removed");
    }
    await this.prisma.applicant.delete({ where: { id: applicantId } });
    return { ok: true };
  }

  async addReference(id: string, dto: ReferenceDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.reference.create({ data: { ...this.referenceData(dto), applicationId: id } });
  }

  async removeReference(id: string, referenceId: string, user: AuthUser) {
    await this.findOne(id, user);
    const ref = await this.prisma.reference.findUnique({ where: { id: referenceId } });
    if (!ref || ref.applicationId !== id) {
      throw new NotFoundException("Reference not found on this application");
    }
    await this.prisma.reference.delete({ where: { id: referenceId } });
    return { ok: true };
  }

  private applicantData(a: ApplicantDto) {
    const { id: _id, isPrimary: _isPrimary, ...rest } = a;
    return rest;
  }

  private referenceData(r: ReferenceDto) {
    const { id: _id, ...rest } = r;
    return rest;
  }
}
