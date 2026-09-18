import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApplicationStatus, AuditAction, Prisma, Role, SanctionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { AuditService, diff } from "../audit/audit.service";
import { formatApplicationNo } from "../applications/applications.service";
import { ListSanctionsQuery, UpsertSanctionDto } from "./dto/sanction.dto";

const APPLICATION_SUMMARY = {
  select: {
    id: true,
    seq: true,
    createdAt: true,
    status: true,
    requestedAmount: true,
    loanProduct: { select: { id: true, name: true } },
    lender: { select: { id: true, name: true } },
    owner: { select: { id: true, name: true } },
    applicants: { where: { isPrimary: true }, take: 1, select: { name: true, phone: true } },
  },
};

@Injectable()
export class SanctionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  private decorate<T extends { application: { seq: number; createdAt: Date } }>(sanction: T) {
    return {
      ...sanction,
      application: {
        ...sanction.application,
        applicationNo: formatApplicationNo(
          sanction.application.seq,
          sanction.application.createdAt,
        ),
      },
    };
  }

  /** One sanction per application, so saving either creates or updates it. */
  async upsert(applicationId: string, dto: UpsertSanctionDto, user: AuthUser, ip?: string) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scopeFor(user) },
      select: { id: true, seq: true, createdAt: true, requestedAmount: true, status: true },
    });
    if (!application) throw new NotFoundException("Application not found");

    const before = await this.prisma.sanction.findUnique({ where: { applicationId } });

    if (dto.sanctionedAmount && dto.sanctionedAmount > Number(application.requestedAmount) * 2) {
      throw new BadRequestException(
        "Sanctioned amount is more than double the requested amount — check the figure",
      );
    }

    const sanction = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.sanction.upsert({
        where: { applicationId },
        create: { applicationId, ...dto },
        update: { ...dto },
      });

      // The financial sanction is what makes a case genuinely sanctioned; the
      // technical one only clears the property/asset side.
      if (
        saved.financialStatus === SanctionStatus.APPROVED &&
        application.status !== ApplicationStatus.DISBURSED
      ) {
        await tx.application.update({
          where: { id: applicationId },
          data: { status: ApplicationStatus.SANCTIONED },
        });
      } else if (saved.financialStatus === SanctionStatus.REJECTED) {
        await tx.application.update({
          where: { id: applicationId },
          data: { status: ApplicationStatus.REJECTED },
        });
      }

      // Re-read so the caller sees the application status these writes just set.
      return tx.sanction.findUniqueOrThrow({
        where: { id: saved.id },
        include: { application: APPLICATION_SUMMARY },
      });
    });

    // Sanctioned amounts and rates decide real money — record who set them.
    await this.audit.record({
      actor: user,
      action: before ? AuditAction.UPDATE : AuditAction.CREATE,
      entity: "Sanction",
      entityId: sanction.id,
      entityLabel: formatApplicationNo(application.seq, application.createdAt),
      changes: diff((before ?? {}) as Record<string, unknown>, dto as Record<string, unknown>),
      ip,
    });

    return this.decorate(sanction);
  }

  async findByApplication(applicationId: string, user: AuthUser) {
    const sanction = await this.prisma.sanction.findFirst({
      where: { applicationId, application: this.scopeFor(user) },
      include: { application: APPLICATION_SUMMARY },
    });
    return sanction ? this.decorate(sanction) : null;
  }

  /** The sanctions register — every case that has reached a sanction decision. */
  async findAll(query: ListSanctionsQuery, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const seqFromSearch = query.search ? Number(query.search.replace(/^.*-/, "")) : NaN;

    const where: Prisma.SanctionWhereInput = {
      ...(query.financialStatus && { financialStatus: query.financialStatus }),
      application: {
        ...this.scopeFor(user),
        ...(query.lenderId && { lenderId: query.lenderId }),
        ...(query.search && {
          OR: [
            ...(Number.isFinite(seqFromSearch) ? [{ seq: seqFromSearch }] : []),
            { applicants: { some: { name: { contains: query.search, mode: "insensitive" } } } },
          ],
        }),
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sanction.findMany({
        where,
        include: { application: APPLICATION_SUMMARY },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sanction.count({ where }),
    ]);

    return { items: items.map((s) => this.decorate(s)), total, page, pageSize };
  }
}
