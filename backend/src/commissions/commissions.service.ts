import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { rangeFilter, resolveRange } from "../common/date.util";
import {
  CreateCommissionDto,
  ListCommissionsQuery,
  UpdateCommissionDto,
  UpdateSplitDto,
} from "./dto/commission.dto";

const SPLIT_INCLUDE = {
  user: { select: { id: true, name: true } },
  sourcingPartner: { select: { id: true, name: true } },
};

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
export class CommissionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  private applicationNo(app: { seq: number; createdAt: Date }) {
    return this.settings.applicationNo(app.seq, app.createdAt);
  }

  async getForDisbursement(disbursementId: string, user: AuthUser) {
    const disbursement = await this.prisma.disbursement.findFirst({
      where: { id: disbursementId, application: this.scopeFor(user) },
      select: { id: true },
    });
    if (!disbursement) throw new NotFoundException("Disbursement not found");

    return this.prisma.commission.findUnique({
      where: { disbursementId },
      include: { splits: { include: SPLIT_INCLUDE } },
    });
  }

  async createForDisbursement(
    disbursementId: string,
    dto: CreateCommissionDto,
    user: AuthUser,
    ip?: string,
  ) {
    const disbursement = await this.prisma.disbursement.findFirst({
      where: { id: disbursementId, application: this.scopeFor(user) },
      include: {
        application: { select: { id: true, seq: true, createdAt: true } },
        commission: { select: { id: true } },
      },
    });
    if (!disbursement) throw new NotFoundException("Disbursement not found");
    if (disbursement.commission) {
      throw new BadRequestException("A commission is already recorded against this payout");
    }

    const splitsInput = dto.splits ?? [];
    let splitTotalPercent = 0;
    for (const split of splitsInput) {
      if (!split.userId && !split.sourcingPartnerId) {
        throw new BadRequestException("Each split needs a staff member or a sourcing partner");
      }
      if (split.userId && split.sourcingPartnerId) {
        throw new BadRequestException("A split can't be both a staff member and a sourcing partner");
      }
      splitTotalPercent += split.sharePercent;
    }
    if (splitTotalPercent > 100) {
      throw new BadRequestException("Split shares can't add up to more than 100%");
    }

    const grossAmount = Number(disbursement.amount) * (dto.grossRate / 100);

    const commission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.commission.create({
        data: {
          disbursementId,
          grossRate: dto.grossRate,
          grossAmount,
          receivedAt: dto.receivedAt,
        },
      });

      if (splitsInput.length) {
        await tx.commissionSplit.createMany({
          data: splitsInput.map((split) => ({
            commissionId: created.id,
            userId: split.userId,
            sourcingPartnerId: split.sourcingPartnerId,
            stakeholderRole: split.stakeholderRole,
            sharePercent: split.sharePercent,
            amount: grossAmount * (split.sharePercent / 100),
          })),
        });
      }

      return tx.commission.findUniqueOrThrow({
        where: { id: created.id },
        include: { splits: { include: SPLIT_INCLUDE } },
      });
    });

    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "Commission",
      entityId: commission.id,
      entityLabel: this.applicationNo(disbursement.application),
      changes: {
        grossRate: { from: null, to: dto.grossRate },
        grossAmount: { from: null, to: grossAmount },
      },
      ip,
    });

    return commission;
  }

  async updateStatus(id: string, dto: UpdateCommissionDto, user: AuthUser, ip?: string) {
    const commission = await this.prisma.commission.findFirst({
      where: { id, disbursement: { application: this.scopeFor(user) } },
      include: { disbursement: { include: { application: { select: { seq: true, createdAt: true } } } } },
    });
    if (!commission) throw new NotFoundException("Commission not found");

    const updated = await this.prisma.commission.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.receivedAt !== undefined && { receivedAt: dto.receivedAt }),
      },
      include: { splits: { include: SPLIT_INCLUDE } },
    });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Commission",
      entityId: id,
      entityLabel: this.applicationNo(commission.disbursement.application),
      changes: {
        ...(dto.status && { status: { from: commission.status, to: dto.status } }),
      },
      ip,
    });

    return updated;
  }

  async updateSplitStatus(
    commissionId: string,
    splitId: string,
    dto: UpdateSplitDto,
    user: AuthUser,
    ip?: string,
  ) {
    const split = await this.prisma.commissionSplit.findFirst({
      where: {
        id: splitId,
        commissionId,
        commission: { disbursement: { application: this.scopeFor(user) } },
      },
      include: {
        commission: {
          include: { disbursement: { include: { application: { select: { seq: true, createdAt: true } } } } },
        },
      },
    });
    if (!split) throw new NotFoundException("Commission split not found");

    const updated = await this.prisma.commissionSplit.update({
      where: { id: splitId },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.paidAt !== undefined && { paidAt: dto.paidAt }),
        ...(dto.stakeholderRole !== undefined && { stakeholderRole: dto.stakeholderRole }),
      },
      include: SPLIT_INCLUDE,
    });

    await this.audit.recordUpdate({
      actor: user,
      entity: "CommissionSplit",
      entityId: splitId,
      entityLabel: this.applicationNo(split.commission.disbursement.application),
      changes: {
        ...(dto.status && { status: { from: split.status, to: dto.status } }),
      },
      ip,
    });

    return updated;
  }

  private buildWhere(query: ListCommissionsQuery, user: AuthUser): Prisma.CommissionWhereInput {
    const seqFromSearch = query.search ? Number(query.search.replace(/^.*-/, "")) : NaN;

    const disbursementWhere: Prisma.DisbursementWhereInput = {
      ...(rangeFilter(resolveRange(query)) && { disbursedAt: rangeFilter(resolveRange(query)) }),
      application: {
        ...this.scopeFor(user),
        ...(query.lenderId && { lenderId: query.lenderId }),
        ...(query.search && {
          OR: [
            ...(Number.isFinite(seqFromSearch) ? [{ seq: seqFromSearch }] : []),
            { applicants: { some: { name: { contains: query.search, mode: "insensitive" as const } } } },
          ],
        }),
      },
    };

    return {
      ...(query.status && { status: query.status }),
      disbursement: disbursementWhere,
    };
  }

  /** Firm-wide commission ledger. */
  async findAll(query: ListCommissionsQuery, user: AuthUser) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const where = this.buildWhere(query, user);

    const [items, total, totals] = await this.prisma.$transaction([
      this.prisma.commission.findMany({
        where,
        include: {
          disbursement: {
            select: { id: true, amount: true, disbursedAt: true, application: APPLICATION_SUMMARY },
          },
          splits: { include: SPLIT_INCLUDE },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.commission.count({ where }),
      this.prisma.commission.aggregate({ where, _sum: { grossAmount: true } }),
    ]);

    return {
      items: items.map((c) => ({
        ...c,
        disbursement: {
          ...c.disbursement,
          application: {
            ...c.disbursement.application,
            applicationNo: this.applicationNo(c.disbursement.application),
          },
        },
      })),
      total,
      page,
      pageSize,
      totalAmount: totals._sum.grossAmount ?? 0,
    };
  }
}
