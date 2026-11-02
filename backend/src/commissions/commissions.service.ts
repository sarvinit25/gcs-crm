import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, PayoutStatus, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { rangeFilter, resolveRange } from "../common/date.util";
import {
  ClaimCommissionDto,
  CommissionExtraInputDto,
  CreateCommissionDto,
  ListCommissionsQuery,
  ReceiveCommissionDto,
  UpdateCommissionDto,
  UpdateExtraDto,
  UpdateSplitDto,
} from "./dto/commission.dto";
import { percentOf, round2 } from "../common/loan-math";

const SPLIT_INCLUDE = {
  user: { select: { id: true, name: true } },
  sourcingPartner: { select: { id: true, name: true } },
};

const COMMISSION_INCLUDE = { splits: { include: SPLIT_INCLUDE }, extras: true };

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
      include: COMMISSION_INCLUDE,
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

    const payout = Number(disbursement.amount);

    // The lender's commission is quoted either as a rate on the payout or as a flat sum.
    if (dto.grossRate === undefined && dto.grossAmount === undefined) {
      throw new BadRequestException("Give the commission as a rate or as an amount");
    }
    const grossAmount = round2(dto.grossAmount ?? payout * ((dto.grossRate as number) / 100));
    if (grossAmount > payout) {
      throw new BadRequestException("The commission can't be more than the amount disbursed");
    }
    const grossRate = dto.grossRate ?? percentOf(grossAmount, payout);

    const splitsInput = dto.splits ?? [];
    let splitTotal = 0;
    const splitRows = splitsInput.map((split) => {
      if (!split.userId && !split.sourcingPartnerId) {
        throw new BadRequestException("Each split needs a staff member or a sourcing partner");
      }
      if (split.userId && split.sourcingPartnerId) {
        throw new BadRequestException("A split can't be both a staff member and a sourcing partner");
      }
      if (split.sharePercent === undefined && split.amount === undefined) {
        throw new BadRequestException("Each split needs a share or an amount");
      }
      const amount = round2(split.amount ?? grossAmount * ((split.sharePercent as number) / 100));
      splitTotal += amount;
      return {
        userId: split.userId,
        sourcingPartnerId: split.sourcingPartnerId,
        stakeholderRole: split.stakeholderRole,
        sharePercent: split.sharePercent ?? percentOf(amount, grossAmount),
        amount,
      };
    });
    // A cent of rounding is not an overpayment.
    if (splitTotal > grossAmount + 0.01) {
      throw new BadRequestException("Splits can't add up to more than the commission");
    }

    const commission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.commission.create({
        data: {
          disbursementId,
          grossRate,
          grossAmount,
          receivedAt: dto.receivedAt,
        },
      });

      if (splitRows.length) {
        await tx.commissionSplit.createMany({
          data: splitRows.map((row) => ({ commissionId: created.id, ...row })),
        });
      }
      if (dto.extras?.length) {
        await tx.commissionExtra.createMany({
          data: dto.extras.map((extra) => ({ commissionId: created.id, ...extra })),
        });
      }

      return tx.commission.findUniqueOrThrow({
        where: { id: created.id },
        include: COMMISSION_INCLUDE,
      });
    });

    await this.audit.record({
      actor: user,
      action: AuditAction.CREATE,
      entity: "Commission",
      entityId: commission.id,
      entityLabel: this.applicationNo(disbursement.application),
      changes: {
        grossRate: { from: null, to: grossRate },
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
        ...(dto.status === PayoutStatus.CLAIMED && !commission.claimedAt && { claimedAt: new Date() }),
        ...(dto.receivedAt !== undefined && { receivedAt: dto.receivedAt }),
      },
      include: COMMISSION_INCLUDE,
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

  private async loadForLifecycle(id: string, user: AuthUser) {
    const commission = await this.prisma.commission.findFirst({
      where: { id, disbursement: { application: this.scopeFor(user) } },
      include: { disbursement: { include: { application: { select: { seq: true, createdAt: true } } } } },
    });
    if (!commission) throw new NotFoundException("Commission not found");
    return commission;
  }

  /** The lender has been asked for the money — it is now owed, not merely due. */
  async claim(id: string, dto: ClaimCommissionDto, user: AuthUser, ip?: string) {
    const commission = await this.loadForLifecycle(id, user);
    if (commission.status !== PayoutStatus.PENDING) {
      throw new BadRequestException(
        commission.status === PayoutStatus.CLAIMED
          ? "This commission has already been claimed"
          : "Only a commission that is still due can be claimed",
      );
    }

    const updated = await this.prisma.commission.update({
      where: { id },
      data: {
        status: PayoutStatus.CLAIMED,
        claimedAt: dto.claimedAt ?? new Date(),
        claimNote: dto.note,
      },
      include: COMMISSION_INCLUDE,
    });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Commission",
      entityId: id,
      entityLabel: this.applicationNo(commission.disbursement.application),
      changes: { status: { from: commission.status, to: PayoutStatus.CLAIMED } },
      ip,
    });
    return updated;
  }

  /**
   * Money from the lender has landed. Amounts add up across receipts, so a
   * lender that pays in parts moves the commission to PARTIAL until the last
   * rupee arrives.
   */
  async receive(id: string, dto: ReceiveCommissionDto, user: AuthUser, ip?: string) {
    const commission = await this.loadForLifecycle(id, user);
    if (commission.status === PayoutStatus.PAID) {
      throw new BadRequestException("This commission has already been received in full");
    }

    const gross = Number(commission.grossAmount);
    const already = Number(commission.receivedAmount ?? 0);
    const outstanding = round2(gross - already);
    const amount = round2(dto.amount ?? outstanding);
    if (amount > outstanding + 0.01) {
      throw new BadRequestException(
        `Only ${outstanding.toFixed(2)} is still outstanding on this commission`,
      );
    }
    const total = round2(already + amount);
    const settled = total >= gross - 0.01;
    const status = settled ? PayoutStatus.PAID : PayoutStatus.PARTIAL;

    const updated = await this.prisma.commission.update({
      where: { id },
      data: {
        status,
        receivedAmount: total,
        receivedAt: dto.receivedAt ?? new Date(),
        ...(dto.reference && { receivedRef: dto.reference }),
      },
      include: COMMISSION_INCLUDE,
    });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Commission",
      entityId: id,
      entityLabel: this.applicationNo(commission.disbursement.application),
      changes: {
        status: { from: commission.status, to: status },
        receivedAmount: { from: already, to: total },
      },
      ip,
    });
    return updated;
  }

  async addExtra(id: string, dto: CommissionExtraInputDto, user: AuthUser, ip?: string) {
    const commission = await this.loadForLifecycle(id, user);
    const extra = await this.prisma.commissionExtra.create({ data: { commissionId: id, ...dto } });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Commission",
      entityId: id,
      entityLabel: this.applicationNo(commission.disbursement.application),
      changes: { [`extra ${dto.source}`]: { from: null, to: dto.amount } },
      ip,
    });
    return extra;
  }

  async updateExtra(id: string, extraId: string, dto: UpdateExtraDto, user: AuthUser, ip?: string) {
    const commission = await this.loadForLifecycle(id, user);
    const extra = await this.prisma.commissionExtra.findFirst({ where: { id: extraId, commissionId: id } });
    if (!extra) throw new NotFoundException("Extra commission not found");

    const updated = await this.prisma.commissionExtra.update({
      where: { id: extraId },
      data: {
        ...(dto.status && { status: dto.status }),
        // Paid money carries a date even when the caller didn't type one.
        ...(dto.receivedAt !== undefined
          ? { receivedAt: dto.receivedAt }
          : dto.status === PayoutStatus.PAID && !extra.receivedAt
            ? { receivedAt: new Date() }
            : {}),
      },
    });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Commission",
      entityId: id,
      entityLabel: this.applicationNo(commission.disbursement.application),
      changes: dto.status ? { [`extra ${extra.source}`]: { from: extra.status, to: dto.status } } : {},
      ip,
    });
    return updated;
  }

  async removeExtra(id: string, extraId: string, user: AuthUser, ip?: string) {
    const commission = await this.loadForLifecycle(id, user);
    const extra = await this.prisma.commissionExtra.findFirst({ where: { id: extraId, commissionId: id } });
    if (!extra) throw new NotFoundException("Extra commission not found");
    await this.prisma.commissionExtra.delete({ where: { id: extraId } });

    await this.audit.recordUpdate({
      actor: user,
      entity: "Commission",
      entityId: id,
      entityLabel: this.applicationNo(commission.disbursement.application),
      changes: { [`extra ${extra.source}`]: { from: extra.amount.toString(), to: null } },
      ip,
    });
    return { ok: true };
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
          extras: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.commission.count({ where }),
      this.prisma.commission.aggregate({ where, _sum: { grossAmount: true } }),
    ]);

    const byStatus = await this.prisma.commission.groupBy({
      by: ["status"],
      where,
      orderBy: { status: "asc" },
      _sum: { grossAmount: true, receivedAmount: true },
      _count: { _all: true },
    });

    // Where the money stands across the whole filtered ledger, not just this page.
    const summary = Object.fromEntries(
      Object.values(PayoutStatus).map((status) => {
        const row = byStatus.find((r) => r.status === status);
        return [
          status,
          {
            count: row?._count._all ?? 0,
            amount: Number(row?._sum.grossAmount ?? 0),
            received: Number(row?._sum.receivedAmount ?? 0),
          },
        ];
      }),
    );

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
      summary,
    };
  }
}
