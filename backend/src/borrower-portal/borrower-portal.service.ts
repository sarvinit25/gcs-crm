import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

@Injectable()
export class BorrowerPortalService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  /**
   * A borrower's own file, reduced to what they should see — loan facts and
   * pipeline progress, never internal notes, commission data, or another
   * applicant's full record.
   */
  async me(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        loanProduct: { select: { name: true } },
        lender: { select: { name: true } },
        owner: { select: { name: true } },
        sanction: {
          select: {
            technicalStatus: true,
            financialStatus: true,
            legalStatus: true,
            sanctionedAmount: true,
            interestRate: true,
            tenureMonths: true,
            validTill: true,
          },
        },
        disbursements: {
          select: { type: true, amount: true, disbursedAt: true },
          orderBy: { disbursedAt: "desc" },
        },
      },
    });
    if (!app) throw new NotFoundException("Application not found");

    const disbursed = app.disbursements.reduce((sum, d) => sum + Number(d.amount), 0);

    return {
      applicationNo: this.settings.applicationNo(app.seq, app.createdAt),
      status: app.status,
      loanProduct: app.loanProduct.name,
      lender: app.lender?.name ?? null,
      requestedAmount: app.requestedAmount,
      tenureMonths: app.tenureMonths,
      createdAt: app.createdAt,
      advisor: app.owner?.name ?? null,
      bankLogin: {
        done: !!app.bankLoginAt,
        at: app.bankLoginAt,
        bankReferenceNo: app.bankReferenceNo,
      },
      sanction: app.sanction,
      disbursements: app.disbursements,
      disbursedTotal: disbursed,
    };
  }
}
