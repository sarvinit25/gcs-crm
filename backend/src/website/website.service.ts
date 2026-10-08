import { Injectable } from "@nestjs/common";
import { Prisma, SubmissionOutcome } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { rangeFilter, resolveRange } from "../common/date.util";
import { ListSubmissionsQuery } from "./dto/website.dto";

/** The inbox of everything that arrived through the public intake (website forms, WhatsApp, telecaller). */
@Injectable()
export class WebsiteService {
  constructor(private prisma: PrismaService) {}

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
