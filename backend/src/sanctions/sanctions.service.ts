import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApplicationStatus, AuditAction, Prisma, Role, SanctionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { ListSanctionsQuery, UpsertSanctionDto } from "./dto/sanction.dto";
import { emi, feeAmount } from "../common/loan-math";
import { EventsService } from "../events/events.service";

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
    private settings: SettingsService,
    private events: EventsService,
  ) {}

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  /** How much of each application's sanction has actually been released so far. */
  private async drawnFor(applicationIds: string[]) {
    if (!applicationIds.length) return new Map<string, { drawn: number; net: number }>();
    const rows = await this.prisma.disbursement.groupBy({
      by: ["applicationId"],
      where: { applicationId: { in: applicationIds } },
      _sum: { amount: true, netAmount: true },
    });
    return new Map(
      rows.map((r) => [
        r.applicationId,
        { drawn: Number(r._sum.amount ?? 0), net: Number(r._sum.netAmount ?? r._sum.amount ?? 0) },
      ]),
    );
  }

  private decorate<
    T extends {
      seq: number;
      createdAt: Date;
      sanctionedAmount: unknown;
      application: { id: string; seq: number; createdAt: Date };
    },
  >(sanction: T, drawnMap: Map<string, { drawn: number; net: number }>, user: AuthUser) {
    const drawn = drawnMap.get(sanction.application.id)?.drawn ?? 0;
    const sanctioned = Number(sanction.sanctionedAmount ?? 0);
    // What the lender pays GCS is commission economics: Admin and Manager only.
    const { commissionPercent, ...visible } = sanction as T & { commissionPercent?: unknown };
    return {
      ...visible,
      ...(user.role !== Role.ADVISOR && { commissionPercent }),
      sanctionNo: this.settings.sanctionNo(sanction.seq, sanction.createdAt),
      drawn,
      undrawn: Math.max(sanctioned - drawn, 0),
      // Pending until money moves; partial while some of the sanction is still undrawn.
      disbursalStatus: (drawn <= 0 ? "PENDING" : sanctioned > 0 && drawn < sanctioned ? "PARTIAL" : "DISBURSED") as
        | "PENDING"
        | "PARTIAL"
        | "DISBURSED",
      application: {
        ...sanction.application,
        applicationNo: this.settings.applicationNo(
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

    const sanityMultiple = this.settings.get<number>("pipeline.sanctionSanityMultiple");
    if (
      dto.sanctionedAmount &&
      dto.sanctionedAmount > Number(application.requestedAmount) * sanityMultiple
    ) {
      throw new BadRequestException(
        `Sanctioned amount is more than ${sanityMultiple}x the requested amount — check the figure`,
      );
    }

    // Figures the lender didn't quote are worked out from the ones they did,
    // using whatever is already on file for anything this edit leaves out.
    const amount = dto.sanctionedAmount ?? (before ? Number(before.sanctionedAmount) || undefined : undefined);
    const rate = dto.interestRate ?? (before ? Number(before.interestRate) : undefined);
    const tenure = dto.tenureMonths ?? before?.tenureMonths ?? undefined;
    const termsTouched =
      dto.sanctionedAmount !== undefined || dto.interestRate !== undefined || dto.tenureMonths !== undefined;
    const computed: { emiAmount?: number; processingFee?: number } = {};
    if (dto.emiAmount === undefined && termsTouched) {
      const calculated = emi(amount, rate, tenure);
      if (calculated !== null) computed.emiAmount = calculated;
    }
    if (dto.processingFee === undefined && dto.processingFeePercent !== undefined) {
      const fee = feeAmount(amount, dto.processingFeePercent, undefined);
      if (fee !== null) computed.processingFee = fee;
    }
    const data = { ...dto, ...computed };
    if (user.role === Role.ADVISOR) delete data.commissionPercent;

    const sanction = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.sanction.upsert({
        where: { applicationId },
        create: { applicationId, ...data },
        update: { ...data },
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
      entityLabel: this.settings.applicationNo(application.seq, application.createdAt),
      changes: diff((before ?? {}) as Record<string, unknown>, data as Record<string, unknown>),
      ip,
    });

    // Told to the customer and the officer only when the decision actually changes, not on every edit.
    if (sanction.financialStatus !== before?.financialStatus) {
      if (sanction.financialStatus === SanctionStatus.APPROVED) this.events.emit("SANCTION_APPROVED", { applicationId });
      else if (sanction.financialStatus === SanctionStatus.REJECTED) this.events.emit("FILE_REJECTED", { applicationId });
    }

    return this.decorate(sanction, await this.drawnFor([applicationId]), user);
  }

  async findByApplication(applicationId: string, user: AuthUser) {
    const sanction = await this.prisma.sanction.findFirst({
      where: { applicationId, application: this.scopeFor(user) },
      include: { application: APPLICATION_SUMMARY },
    });
    return sanction ? this.decorate(sanction, await this.drawnFor([applicationId]), user) : null;
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

    const [items, total, totals] = await this.prisma.$transaction([
      this.prisma.sanction.findMany({
        where,
        include: { application: APPLICATION_SUMMARY },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sanction.count({ where }),
      this.prisma.sanction.aggregate({ where, _sum: { sanctionedAmount: true } }),
    ]);

    const drawnMap = await this.drawnFor(items.map((s) => s.application.id));
    return {
      items: items.map((s) => this.decorate(s, drawnMap, user)),
      total,
      page,
      pageSize,
      totalSanctioned: totals._sum.sanctionedAmount ?? 0,
    };
  }
}
