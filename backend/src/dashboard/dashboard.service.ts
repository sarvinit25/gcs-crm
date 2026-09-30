import { Injectable } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";
import { describeRange, rangeFilter, resolveRange, type RangeInput } from "../common/date.util";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(user: AuthUser, input: RangeInput = {}) {
    const window = resolveRange(input);
    const bounds = rangeFilter(window);
    const within = (field: string) => (bounds ? { [field]: bounds } : {});

    const leadScope: Prisma.LeadWhereInput = {
      ...(user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {}),
      ...within("createdAt"),
    };
    const ownerScope: Prisma.ApplicationWhereInput =
      user.role === Role.ADVISOR ? { ownerId: user.id } : {};
    const appScope: Prisma.ApplicationWhereInput = { ...ownerScope, ...within("createdAt") };

    const [
      byStatus,
      totalLeads,
      dueFollowUps,
      applications,
      sanctions,
      disbursedAgg,
      commissionAgg,
      requestedAgg,
      sanctionedAgg,
      byProduct,
      products,
    ] = await this.prisma.$transaction([
      this.prisma.lead.groupBy({
        by: ["status"],
        where: leadScope,
        _count: true,
        orderBy: { status: "asc" },
      }),
      this.prisma.lead.count({ where: leadScope }),
      this.prisma.lead.count({
        where: {
          ...(user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {}),
          nextFollowUpAt: { lte: new Date() },
        },
      }),
      this.prisma.application.count({ where: appScope }),
      this.prisma.sanction.count({
        where: { application: ownerScope, ...within("createdAt") },
      }),
      this.prisma.disbursement.aggregate({
        where: { application: ownerScope, ...within("disbursedAt") },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.commission.aggregate({
        where: { disbursement: { application: ownerScope }, ...within("createdAt") },
        _sum: { grossAmount: true },
      }),
      this.prisma.application.aggregate({ where: appScope, _sum: { requestedAmount: true } }),
      this.prisma.sanction.aggregate({
        where: { application: ownerScope, ...within("createdAt") },
        _sum: { sanctionedAmount: true },
      }),
      this.prisma.application.groupBy({
        by: ["loanProductId"],
        where: appScope,
        _count: true,
        _sum: { requestedAmount: true },
        orderBy: { loanProductId: "asc" },
      }),
      this.prisma.loanProduct.findMany({ select: { id: true, name: true } }),
    ]);

    const productName = new Map(products.map((p) => [p.id, p.name]));
    const loanDistribution = byProduct
      .map((r) => ({
        name: r.loanProductId ? (productName.get(r.loanProductId) ?? "Other") : "Unspecified",
        count: Number(r._count ?? 0),
        amount: Number(r._sum?.requestedAmount ?? 0),
      }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount);

    const statusCount = Object.fromEntries(byStatus.map((r) => [r.status, Number(r._count ?? 0)]));
    const requested = Number(requestedAgg._sum.requestedAmount ?? 0);
    const sanctioned = Number(sanctionedAgg._sum.sanctionedAmount ?? 0);
    const disbursed = Number(disbursedAgg._sum.amount ?? 0);
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

    return {
      range: input.range ?? (bounds ? "custom" : "all"),
      period: describeRange(window, input.range),
      leads: { total: totalLeads, dueFollowUps, byStatus: statusCount },
      applications,
      sanctions,
      disbursements: { count: disbursedAgg._count, amount: disbursedAgg._sum.amount ?? 0 },
      commissionEarned: user.role === Role.ADVISOR ? null : (commissionAgg._sum.grossAmount ?? 0),
      loanDistribution,
      performance: {
        leadToApplicationPct: pct(Number(statusCount.CONVERTED ?? 0), totalLeads),
        applicationToSanctionPct: pct(sanctions, applications),
        sanctionedToDisbursedPct: pct(disbursed, sanctioned),
        averageTicket: applications ? Math.round(requested / applications) : 0,
        requestedAmount: requested,
        sanctionedAmount: sanctioned,
        disbursedAmount: disbursed,
      },
    };
  }
}
