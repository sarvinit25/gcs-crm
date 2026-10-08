import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, diff } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type { AuthUser } from "../auth/auth.decorators";
import { describeRange, istToday, rangeFilter, resolveRange } from "../common/date.util";
import { cleanTag } from "./channel.util";
import { CreateSpendDto, ListSpendQuery, PerformanceQuery, UpdateSpendDto, type Grouping } from "./dto/marketing.dto";
import { NOT_TRACKED, NO_CAMPAIGN, funnelOf, mergeSpend, sortRows, totalOf, type CohortRow, type SpendRow } from "./metrics";

/** Fixed SQL for each way of slicing the leads — chosen from this table, never built from request text. */
const GROUP_SQL: Record<Grouping, { key: string; channel: string; campaign: string }> = {
  channel: { key: `COALESCE(l."channel", '${NOT_TRACKED}')`, channel: `l."channel"`, campaign: `NULL` },
  campaign: {
    key: `COALESCE(l."channel", '${NOT_TRACKED}') || ' / ' || COALESCE(l."campaign", '${NO_CAMPAIGN}')`,
    channel: `l."channel"`,
    campaign: `l."campaign"`,
  },
  landing: { key: `COALESCE(l."landingPage", '(page not recorded)')`, channel: `NULL`, campaign: `NULL` },
  month: { key: `to_char(l."createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`, channel: `NULL`, campaign: `NULL` },
};

const day = (d: Date) => new Date(`${istToday(d)}T00:00:00.000Z`);
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

type RawRow = Omit<CohortRow, "key"> & { key: string };

@Injectable()
export class MarketingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  channels() {
    return this.settings.get<string[]>("marketing.channels");
  }

  /** Dates a request means, as a spend-date window (spend is dated by day, not by moment). */
  private spendWindow(q: { range?: string; from?: string; to?: string }) {
    const r = resolveRange(q);
    return { range: r, filter: r.from || r.to ? { ...(r.from && { gte: day(r.from) }), ...(r.to && { lte: day(r.to) }) } : undefined };
  }

  /**
   * How each channel / campaign / landing page / month did: what was spent, the leads it brought,
   * how many got qualified, became applications, were sanctioned and disbursed — and what each cost.
   */
  async performance(q: PerformanceQuery) {
    const by: Grouping = q.by ?? "channel";
    const { range, filter: spendFilter } = this.spendWindow(q);
    const created = rangeFilter(range);
    const g = GROUP_SQL[by];

    const dateSql = Prisma.sql`${created?.gte ? Prisma.sql`AND l."createdAt" >= ${created.gte}` : Prisma.empty} ${created?.lte ? Prisma.sql`AND l."createdAt" <= ${created.lte}` : Prisma.empty}`;

    const cohorts = await this.prisma.$queryRaw<RawRow[]>`
      SELECT ${Prisma.raw(g.key)} AS "key",
             ${Prisma.raw(g.channel)} AS "channel",
             ${Prisma.raw(g.campaign)} AS "campaign",
             COUNT(*)::int AS "leads",
             COUNT(*) FILTER (WHERE l."status" IN ('QUALIFIED','DOCS_PENDING','CONVERTED') OR a."id" IS NOT NULL)::int AS "qualified",
             COUNT(*) FILTER (WHERE l."status" = 'LOST')::int AS "lost",
             COUNT(a."id")::int AS "applications",
             COUNT(*) FILTER (WHERE a."status" IN ('SANCTIONED','DISBURSED') OR s."id" IS NOT NULL)::int AS "sanctioned",
             COUNT(*) FILTER (WHERE a."status" = 'DISBURSED' OR d."total" IS NOT NULL)::int AS "disbursed",
             COALESCE(SUM(d."total"), 0)::float8 AS "disbursedAmount",
             COALESCE(SUM(c."gross"), 0)::float8 AS "commission"
      FROM "Lead" l
      LEFT JOIN "Application" a ON a."leadId" = l."id"
      LEFT JOIN "Sanction" s ON s."applicationId" = a."id"
      LEFT JOIN (SELECT "applicationId", SUM("amount") AS "total" FROM "Disbursement" GROUP BY "applicationId") d ON d."applicationId" = a."id"
      LEFT JOIN (
        SELECT di."applicationId", SUM(cm."grossAmount") AS "gross"
        FROM "Commission" cm JOIN "Disbursement" di ON di."id" = cm."disbursementId"
        GROUP BY di."applicationId"
      ) c ON c."applicationId" = a."id"
      WHERE TRUE ${dateSql}
      GROUP BY 1, 2, 3`;

    const spends = await this.prisma.marketingSpend.findMany({
      where: spendFilter ? { spentOn: spendFilter } : {},
      select: { spentOn: true, channel: true, campaign: true, amount: true },
    });
    const spendRows: SpendRow[] =
      by === "landing"
        ? []
        : spends.map((s) => ({
            key:
              by === "channel" ? s.channel
              : by === "campaign" ? `${s.channel} / ${s.campaign ?? NO_CAMPAIGN}`
              : monthOf(s.spentOn),
            channel: s.channel,
            campaign: s.campaign,
            spend: Number(s.amount),
          }));

    let rows = mergeSpend(cohorts.map((c) => ({ ...c })), spendRows);
    rows = by === "month" ? rows.sort((a, b) => a.key.localeCompare(b.key)) : sortRows(rows);
    const total = totalOf(rows);

    return {
      by,
      period: describeRange(range, q.range),
      rows,
      total,
      funnel: funnelOf(total),
      // Spend can only be tied to a channel or campaign; for landing pages it is shown in the total only.
      spendTracked: by !== "landing",
    };
  }

  /** The same figures as a flat table for CSV. */
  async exportRows(q: PerformanceQuery) {
    const report = await this.performance(q);
    const label = (k: string) => (report.by === "month" ? k : k);
    return [...report.rows, { ...report.total, key: "TOTAL" }].map((r) => ({
      [report.by === "channel" ? "Channel" : report.by === "campaign" ? "Channel / campaign" : report.by === "landing" ? "Landing page" : "Month"]: label(r.key),
      "Spend (₹)": r.spend,
      Leads: r.leads,
      Qualified: r.qualified,
      Applications: r.applications,
      Sanctioned: r.sanctioned,
      Disbursed: r.disbursed,
      "Disbursed amount (₹)": r.disbursedAmount,
      "Commission earned (₹)": r.commission,
      "Cost per lead (₹)": r.costPerLead ?? "",
      "Cost per qualified lead (₹)": r.costPerQualified ?? "",
      "Cost per application (₹)": r.costPerApplication ?? "",
      "Cost per disbursal (₹)": r.costPerDisbursal ?? "",
      "Qualified %": r.qualifiedRate ?? "",
      "Applications %": r.applicationRate ?? "",
      "Disbursed %": r.disbursalRate ?? "",
      "Commission per ₹1 spent": r.returnOnSpend ?? "",
    }));
  }

  // ── spend log ─────────────────────────────────────────────

  async listSpend(q: ListSpendQuery) {
    const { filter } = this.spendWindow(q);
    const where: Prisma.MarketingSpendWhereInput = { ...(filter && { spentOn: filter }), ...(q.channel && { channel: q.channel }) };
    const [items, sum] = await this.prisma.$transaction([
      this.prisma.marketingSpend.findMany({
        where,
        orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
        take: 500,
        include: { createdBy: { select: { name: true } } },
      }),
      this.prisma.marketingSpend.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);
    return { items, total: Number(sum._sum.amount ?? 0), count: sum._count };
  }

  async createSpend(dto: CreateSpendDto, actor: AuthUser, ip?: string) {
    const spend = await this.prisma.marketingSpend.create({
      data: {
        spentOn: new Date(dto.spentOn),
        channel: cleanTag(dto.channel, 60) ?? dto.channel,
        campaign: cleanTag(dto.campaign),
        vendor: cleanTag(dto.vendor),
        amount: dto.amount,
        note: cleanTag(dto.note, 300),
        createdById: actor.id,
      },
    });
    await this.audit.record({
      actor,
      action: AuditAction.CREATE,
      entity: "MarketingSpend",
      entityId: spend.id,
      entityLabel: `${spend.channel} · ₹${spend.amount}`,
      ip,
    });
    return spend;
  }

  async updateSpend(id: string, dto: UpdateSpendDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.marketingSpend.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Spend entry not found");
    const data: Prisma.MarketingSpendUpdateInput = {
      ...(dto.spentOn && { spentOn: new Date(dto.spentOn) }),
      ...(dto.channel && { channel: cleanTag(dto.channel, 60) ?? before.channel }),
      ...(dto.campaign !== undefined && { campaign: cleanTag(dto.campaign) ?? null }),
      ...(dto.vendor !== undefined && { vendor: cleanTag(dto.vendor) ?? null }),
      ...(dto.amount !== undefined && { amount: dto.amount }),
      ...(dto.note !== undefined && { note: cleanTag(dto.note, 300) ?? null }),
    };
    const spend = await this.prisma.marketingSpend.update({ where: { id }, data });
    await this.audit.recordUpdate({
      actor,
      entity: "MarketingSpend",
      entityId: id,
      entityLabel: `${spend.channel} · ₹${spend.amount}`,
      changes: diff(before as unknown as Record<string, unknown>, data as Record<string, unknown>),
      ip,
    });
    return spend;
  }

  async removeSpend(id: string, actor: AuthUser, ip?: string) {
    const before = await this.prisma.marketingSpend.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Spend entry not found");
    await this.prisma.marketingSpend.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: AuditAction.DELETE,
      entity: "MarketingSpend",
      entityId: id,
      entityLabel: `${before.channel} · ₹${before.amount}`,
      ip,
    });
    return { ok: true };
  }
}
