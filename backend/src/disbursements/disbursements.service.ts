import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ApplicationStatus,
  AuditAction,
  DisbursementType,
  Prisma,
  Role,
  SanctionStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { CreateDisbursementDto, ListDisbursementsQuery } from "./dto/disbursement.dto";

const APPLICATION_SUMMARY = {
  select: {
    id: true,
    seq: true,
    createdAt: true,
    status: true,
    loanProduct: { select: { id: true, name: true } },
    lender: { select: { id: true, name: true } },
    owner: { select: { id: true, name: true } },
    applicants: { where: { isPrimary: true }, take: 1, select: { name: true } },
  },
};

@Injectable()
export class DisbursementsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  private decorate<T extends { application: { seq: number; createdAt: Date } }>(row: T) {
    return {
      ...row,
      application: {
        ...row.application,
        applicationNo: this.settings.applicationNo(row.application.seq, row.application.createdAt),
      },
    };
  }

  async listForApplication(applicationId: string, user: AuthUser) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scopeFor(user) },
      select: { id: true, sanction: { select: { sanctionedAmount: true } } },
    });
    if (!application) throw new NotFoundException("Application not found");

    const items = await this.prisma.disbursement.findMany({
      where: { applicationId },
      orderBy: { disbursedAt: "asc" },
    });

    const sanctioned = Number(application.sanction?.sanctionedAmount ?? 0);
    const drawn = items.reduce((sum, d) => sum + Number(d.amount), 0);

    return { items, sanctionedAmount: sanctioned, drawn, undrawn: Math.max(sanctioned - drawn, 0) };
  }

  async create(applicationId: string, dto: CreateDisbursementDto, user: AuthUser, ip?: string) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scopeFor(user) },
      select: {
        id: true,
        seq: true,
        createdAt: true,
        status: true,
        sanction: { select: { financialStatus: true, sanctionedAmount: true } },
      },
    });
    if (!application) throw new NotFoundException("Application not found");

    // Money cannot be released against a file the lender has not sanctioned.
    if (application.sanction?.financialStatus !== SanctionStatus.APPROVED) {
      throw new BadRequestException(
        "This application has no approved financial sanction — record the sanction first",
      );
    }

    const sanctioned = Number(application.sanction.sanctionedAmount ?? 0);
    if (!sanctioned) {
      throw new BadRequestException("The sanction has no sanctioned amount recorded");
    }

    const existing = await this.prisma.disbursement.findMany({
      where: { applicationId },
      select: { amount: true },
    });
    const alreadyDrawn = existing.reduce((sum, d) => sum + Number(d.amount), 0);
    const undrawn = sanctioned - alreadyDrawn;

    if (dto.amount > undrawn) {
      throw new BadRequestException(
        `Only ${undrawn.toFixed(2)} remains undrawn against a sanction of ${sanctioned.toFixed(2)}`,
      );
    }

    const runningBalance = undrawn - dto.amount;
    // Anything that leaves money on the table is a part disbursement, whatever
    // the caller labelled it.
    const type = runningBalance > 0 ? DisbursementType.PART : DisbursementType.FULL;

    const disbursement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.disbursement.create({
        data: {
          applicationId,
          type,
          amount: dto.amount,
          disbursedAt: dto.disbursedAt,
          interestRate: dto.interestRate,
          runningBalance,
          utrNo: dto.utrNo,
          note: dto.note,
        },
      });

      if (runningBalance === 0 && application.status !== ApplicationStatus.DISBURSED) {
        await tx.application.update({
          where: { id: applicationId },
          data: { status: ApplicationStatus.DISBURSED },
        });
      }

      return created;
    });

    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "Disbursement",
      entityId: disbursement.id,
      entityLabel: this.settings.applicationNo(application.seq, application.createdAt),
      changes: {
        amount: { from: null, to: dto.amount },
        type: { from: null, to: type },
        runningBalance: { from: undrawn, to: runningBalance },
      },
      ip,
    });

    return disbursement;
  }

  async remove(applicationId: string, id: string, user: AuthUser, ip?: string) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scopeFor(user) },
      select: { id: true, seq: true, createdAt: true },
    });
    if (!application) throw new NotFoundException("Application not found");

    const disbursement = await this.prisma.disbursement.findFirst({
      where: { id, applicationId },
      include: { commission: { select: { id: true } } },
    });
    if (!disbursement) throw new NotFoundException("Disbursement not found");

    // A commission has already been raised against this payout; reversing it
    // silently would leave the ledger pointing at money that never moved.
    if (disbursement.commission) {
      throw new BadRequestException(
        "This disbursement has a commission recorded against it — remove that first",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.disbursement.delete({ where: { id } });
      // The file is no longer fully drawn, so it is back to merely sanctioned.
      await tx.application.update({
        where: { id: applicationId },
        data: { status: ApplicationStatus.SANCTIONED },
      });
    });

    await this.audit.record({
      actor: user,
      action: AuditAction.DELETE,
      entity: "Disbursement",
      entityId: id,
      entityLabel: this.settings.applicationNo(application.seq, application.createdAt),
      changes: { amount: { from: disbursement.amount.toString(), to: null } },
      ip,
    });

    return { ok: true };
  }

  /** Firm-wide disbursement register. */
  async findAll(query: ListDisbursementsQuery, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const seqFromSearch = query.search ? Number(query.search.replace(/^.*-/, "")) : NaN;

    const where: Prisma.DisbursementWhereInput = {
      ...((query.from || query.to) && {
        disbursedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
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

    const [items, total, totals] = await this.prisma.$transaction([
      this.prisma.disbursement.findMany({
        where,
        include: { application: APPLICATION_SUMMARY },
        orderBy: { disbursedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.disbursement.count({ where }),
      this.prisma.disbursement.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      items: items.map((d) => this.decorate(d)),
      total,
      page,
      pageSize,
      totalAmount: totals._sum.amount ?? 0,
    };
  }
}
