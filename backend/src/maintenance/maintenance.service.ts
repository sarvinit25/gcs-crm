import { Injectable } from "@nestjs/common";
import { ApplicationStatus, AuditAction, LeadStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth.decorators";

const CLOSED_LEADS = [LeadStatus.CONVERTED, LeadStatus.LOST];
const FINISHED_APPS = [ApplicationStatus.DISBURSED, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN];

/**
 * Yearly tidy-up: finished files drop out of the working lists so they stay
 * fast and uncluttered. Nothing is deleted — archived files remain searchable,
 * in reports and in the audit trail, and can be restored one by one.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private cutoff(months: number) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d;
  }

  private where(months: number) {
    const before = this.cutoff(months);
    return {
      leads: { archivedAt: null, status: { in: CLOSED_LEADS }, updatedAt: { lt: before } },
      applications: { archivedAt: null, status: { in: FINISHED_APPS }, updatedAt: { lt: before } },
    };
  }

  async preview(months: number) {
    const w = this.where(months);
    const [leads, applications] = await Promise.all([
      this.prisma.lead.count({ where: w.leads }),
      this.prisma.application.count({ where: w.applications }),
    ]);
    return { months, leads, applications, cutoff: this.cutoff(months).toISOString() };
  }

  async archive(months: number, actor: AuthUser, ip?: string) {
    const w = this.where(months);
    const now = new Date();
    const [leads, applications] = await this.prisma.$transaction([
      this.prisma.lead.updateMany({ where: w.leads, data: { archivedAt: now } }),
      this.prisma.application.updateMany({ where: w.applications, data: { archivedAt: now } }),
    ]);

    await this.audit.record({
      actor,
      action: AuditAction.UPDATE,
      entity: "Archive",
      entityId: now.toISOString().slice(0, 10),
      entityLabel: `Archived closed files older than ${months} months`,
      changes: {
        leads: { from: null, to: leads.count },
        applications: { from: null, to: applications.count },
      },
      ip,
    });
    return { months, leads: leads.count, applications: applications.count };
  }
}
