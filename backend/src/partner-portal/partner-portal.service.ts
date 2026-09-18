import { Injectable } from "@nestjs/common";
import { LeadStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PartnerPortalService {
  constructor(private prisma: PrismaService) {}

  async me(partnerId: string) {
    return this.prisma.sourcingPartner.findUniqueOrThrow({
      where: { id: partnerId },
      select: {
        id: true,
        name: true,
        firm: true,
        phone: true,
        email: true,
        city: true,
        commissionRate: true,
        createdAt: true,
      },
    });
  }

  async stats(partnerId: string) {
    const [total, converted] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { sourcingPartnerId: partnerId } }),
      this.prisma.lead.count({
        where: { sourcingPartnerId: partnerId, status: LeadStatus.CONVERTED },
      }),
    ]);
    return {
      totalReferred: total,
      converted,
      conversionRate: total ? Number(((converted / total) * 100).toFixed(1)) : 0,
    };
  }

  /** A partner sees only the leads they themselves referred — nothing else in the CRM. */
  leads(partnerId: string) {
    return this.prisma.lead.findMany({
      where: { sourcingPartnerId: partnerId },
      select: {
        id: true,
        leadNo: true,
        name: true,
        status: true,
        createdAt: true,
        loanProduct: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  rateCard() {
    return this.prisma.commissionRateCard.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  }
}
