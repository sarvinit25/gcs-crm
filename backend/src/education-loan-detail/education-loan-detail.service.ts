import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { UpsertEducationLoanDetailDto } from "./dto/education-loan-detail.dto";

@Injectable()
export class EducationLoanDetailService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  private scopeFor(user: AuthUser): Prisma.ApplicationWhereInput {
    return user.role === Role.ADVISOR ? { ownerId: user.id } : {};
  }

  private async findApplication(applicationId: string, user: AuthUser) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scopeFor(user) },
      select: { id: true, seq: true, createdAt: true },
    });
    if (!application) throw new NotFoundException("Application not found");
    return application;
  }

  async get(applicationId: string, user: AuthUser) {
    await this.findApplication(applicationId, user);
    return this.prisma.educationLoanDetail.findUnique({ where: { applicationId } });
  }

  async upsert(
    applicationId: string,
    dto: UpsertEducationLoanDetailDto,
    user: AuthUser,
    ip?: string,
  ) {
    const application = await this.findApplication(applicationId, user);

    const existing = await this.prisma.educationLoanDetail.findUnique({ where: { applicationId } });
    const detail = await this.prisma.educationLoanDetail.upsert({
      where: { applicationId },
      update: { details: dto as unknown as Prisma.InputJsonValue },
      create: { applicationId, details: dto as unknown as Prisma.InputJsonValue },
    });

    await this.audit.record({
      actor: user,
      action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
      entity: "EducationLoanDetail",
      entityId: detail.id,
      entityLabel: this.settings.applicationNo(application.seq, application.createdAt),
      ip,
    });

    return detail;
  }
}
