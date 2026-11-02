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
import { rangeFilter, resolveRange } from "../common/date.util";
import { netOfDeductions } from "../common/loan-math";
import { EventsService } from "../events/events.service";

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
    private events: EventsService,
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
      include: {
        // Commission economics belong to Admin and Manager; Staff only need to know one exists.
        commission:
          user.role === Role.ADVISOR
            ? { select: { id: true } }
            : {
                include: {
                  extras: true,
                  splits: {
                    include: {
                      user: { select: { id: true, name: true } },
                      sourcingPartner: { select: { id: true, name: true } },
                    },
                  },
                },
              },
      },
    });

    const sanctioned = Number(application.sanction?.sanctionedAmount ?? 0);
    const drawn = items.reduce((sum, d) => sum + Number(d.amount), 0);

    return { items, sanctionedAmount: sanctioned, drawn, undrawn: Math.max(sanctioned - drawn, 0) };
  }

  /**
   * Requested → sanctioned → disbursed → earned, for one file. The earning
   * side is Admin and Manager only, the same line the commission screens draw.
   */
  async moneyTrail(applicationId: string, user: AuthUser) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scopeFor(user) },
      select: {
        id: true,
        requestedAmount: true,
        sanction: { select: { sanctionedAmount: true } },
      },
    });
    if (!application) throw new NotFoundException("Application not found");

    const disbursements = await this.prisma.disbursement.aggregate({
      where: { applicationId },
      _sum: { amount: true, netAmount: true },
      _count: true,
    });

    const base = {
      requested: Number(application.requestedAmount),
      sanctioned: Number(application.sanction?.sanctionedAmount ?? 0),
      disbursed: Number(disbursements._sum.amount ?? 0),
      netDisbursed: Number(disbursements._sum.netAmount ?? disbursements._sum.amount ?? 0),
      payouts: disbursements._count,
    };
    if (user.role === Role.ADVISOR) return { ...base, commission: null };

    const commissions = await this.prisma.commission.findMany({
      where: { disbursement: { applicationId } },
      include: { extras: true, splits: true },
    });
    const sum = (values: Array<unknown>) => values.reduce<number>((t, v) => t + Number(v ?? 0), 0);

    const lender = sum(commissions.map((c) => c.grossAmount));
    const extras = sum(commissions.flatMap((c) => c.extras.map((e) => e.amount)));
    // A commission marked paid before amounts were tracked counts as received in full.
    const receivedLender = sum(
      commissions.map((c) => c.receivedAmount ?? (c.status === "PAID" ? c.grossAmount : 0)),
    );
    const receivedExtras = sum(
      commissions.flatMap((c) => c.extras.filter((e) => e.status === "PAID").map((e) => e.amount)),
    );
    const sharedOut = sum(commissions.flatMap((c) => c.splits.map((sp) => sp.amount)));
    const total = lender + extras;
    const received = receivedLender + receivedExtras;

    return {
      ...base,
      commission: {
        lender,
        extras,
        total,
        received,
        outstanding: Math.max(total - received, 0),
        sharedOut,
        retained: total - sharedOut,
      },
    };
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

    const deductions = [
      dto.processingFee,
      dto.insuranceAmount,
      dto.documentationCharges,
      dto.stampDuty,
      dto.otherDeductions,
    ];
    const netAmount = netOfDeductions(dto.amount, deductions);
    if (netAmount < 0) {
      throw new BadRequestException("The deductions add up to more than the amount disbursed");
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
          roiType: dto.roiType,
          loanAccountNo: dto.loanAccountNo,
          runningBalance,
          utrNo: dto.utrNo,
          processingFee: dto.processingFee,
          insuranceAmount: dto.insuranceAmount,
          documentationCharges: dto.documentationCharges,
          stampDuty: dto.stampDuty,
          otherDeductions: dto.otherDeductions,
          netAmount,
          mode: dto.mode,
          bankName: dto.bankName,
          accountNo: dto.accountNo,
          ifsc: dto.ifsc?.toUpperCase(),
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
        netAmount: { from: null, to: netAmount },
        runningBalance: { from: undrawn, to: runningBalance },
      },
      ip,
    });

    this.events.emit("DISBURSAL_COMPLETED", { applicationId, disbursementId: disbursement.id });

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
      ...(rangeFilter(resolveRange(query)) && { disbursedAt: rangeFilter(resolveRange(query)) }),
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
