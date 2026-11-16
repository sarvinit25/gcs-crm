import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma, SubmissionOutcome } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { rangeFilter, resolveRange } from "../common/date.util";
import { ListSubmissionsQuery } from "./dto/website.dto";
import { AuditService } from "../audit/audit.service";
import { LeadsService } from "../leads/leads.service";
import type { AuthUser } from "../auth/auth.decorators";

/** The inbox of everything that arrived through the public intake (website forms, WhatsApp, telecaller). */
@Injectable()
export class WebsiteService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private leads: LeadsService,
  ) {}

  /**
   * Deletes a website entry for good. When the lead it created goes too, that happens first: a lead with a loan file is
   * refused with its own message and the entry is left untouched, so nothing is half-deleted.
   */
  async remove(id: string, withLead: boolean, user: AuthUser, ip?: string) {
    const entry = await this.prisma.websiteSubmission.findUnique({
      where: { id },
      select: { id: true, name: true, form: true, leadId: true },
    });
    if (!entry) throw new NotFoundException("Entry not found");

    if (withLead && entry.leadId) await this.leads.remove(entry.leadId, user, ip);
    await this.prisma.websiteSubmission.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: AuditAction.DELETE,
      entity: "WebsiteSubmission",
      entityId: id,
      entityLabel: `${entry.name} (${entry.form})${withLead && entry.leadId ? ", with its lead" : ""}`,
      ip,
    });
    return { ok: true };
  }

  async list(q: ListSubmissionsQuery) {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 25, 100);
    const received = rangeFilter(resolveRange(q));
    const inRange: Prisma.WebsiteSubmissionWhereInput = received ? { receivedAt: received } : {};

    const where: Prisma.WebsiteSubmissionWhereInput = {
      ...inRange,
      ...(q.form && { form: q.form }),
      ...(q.leadId && { leadId: q.leadId }),
      ...(q.outcome && { outcome: q.outcome }),
      ...(q.sharedPhone === "true" && { sharedPhone: true }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: "insensitive" } },
          { phone: { contains: q.search } },
          { email: { contains: q.search, mode: "insensitive" } },
          { city: { contains: q.search, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.websiteSubmission.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          lead: {
            select: { id: true, leadNo: true, name: true, status: true, assignedOfficer: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.websiteSubmission.count({ where }),
    ]);
    // How many other entries share each row's lead, so a row can say it has duplicates without a second request.
    const leadIds = [...new Set(items.flatMap((i) => (i.leadId ? [i.leadId] : [])))];
    const perLead = leadIds.length
      ? await this.prisma.websiteSubmission.groupBy({ by: ["leadId"], where: { leadId: { in: leadIds } }, _count: { id: true } })
      : [];
    const [byOutcome, shared, byForm] = await Promise.all([
      this.prisma.websiteSubmission.groupBy({ by: ["outcome"], where: inRange, _count: { id: true } }),
      this.prisma.websiteSubmission.count({ where: { ...inRange, sharedPhone: true } }),
      this.prisma.websiteSubmission.groupBy({ by: ["form"], where: inRange, _count: { id: true } }),
    ]);

    const count = (o: SubmissionOutcome) => byOutcome.find((r) => r.outcome === o)?._count.id ?? 0;
    return {
      items: items.map((i) => ({ ...i, others: Math.max(0, (perLead.find((r) => r.leadId === i.leadId)?._count.id ?? 1) - 1) })),
      total,
      page,
      pageSize,
      // Tiles and the form filter describe the chosen period as a whole, not the current filters.
      summary: {
        received: byOutcome.reduce((n, r) => n + r._count.id, 0),
        newLeads: count(SubmissionOutcome.NEW_LEAD),
        duplicatesKept: count(SubmissionOutcome.DUPLICATE_KEPT),
        duplicatesUpdated: count(SubmissionOutcome.DUPLICATE_UPDATED),
        sharedPhone: shared,
      },
      forms: byForm.map((r) => ({ form: r.form, count: r._count.id })),
    };
  }
}
