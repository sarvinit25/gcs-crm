import { Injectable } from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.decorators";

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(user: AuthUser) {
    const leadScope: Prisma.LeadWhereInput =
      user.role === Role.ADVISOR ? { assignedOfficerId: user.id } : {};
    const appScope: Prisma.ApplicationWhereInput =
      user.role === Role.ADVISOR ? { ownerId: user.id } : {};

    const [byStatus, totalLeads, dueFollowUps, applications, sanctions, disbursedAgg, commissionAgg] =
      await this.prisma.$transaction([
        this.prisma.lead.groupBy({
          by: ["status"],
          where: leadScope,
          _count: true,
          orderBy: { status: "asc" },
        }),
        this.prisma.lead.count({ where: leadScope }),
        this.prisma.lead.count({
          where: { ...leadScope, nextFollowUpAt: { lte: new Date() } },
        }),
        this.prisma.application.count({ where: appScope }),
        this.prisma.sanction.count({ where: { application: appScope } }),
        this.prisma.disbursement.aggregate({
          where: { application: appScope },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.commission.aggregate({
          where: { disbursement: { application: appScope } },
          _sum: { grossAmount: true },
        }),
      ]);

    return {
      leads: {
        total: totalLeads,
        dueFollowUps,
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      },
      applications,
      sanctions,
      disbursements: {
        count: disbursedAgg._count,
        amount: disbursedAgg._sum.amount ?? 0,
      },
      commissionEarned: commissionAgg._sum.grossAmount ?? 0,
    };
  }
}
