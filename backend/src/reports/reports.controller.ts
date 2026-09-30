import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { EXPORT_LIMIT, RECORD_TYPES, ReportsService, type RecordFilters, type RecordType, type ReportRange } from "./reports.service";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";
import { toCsv } from "../common/csv.util";
import { istToday } from "../common/date.util";
import { buildReportCsv, buildReportWorkbook } from "./report-workbook";

@Controller("reports")
export class ReportsController {
  constructor(
    private reports: ReportsService,
    private settings: SettingsService,
  ) {}

  @Get("funnel")
  funnel(@Query() range: ReportRange, @CurrentUser() user: AuthUser) {
    return this.reports.funnel(range, user);
  }

  @Get("by-source")
  bySource(@Query() range: ReportRange, @CurrentUser() user: AuthUser) {
    return this.reports.bySource(range, user);
  }

  @Get("by-product")
  byProduct(@Query() range: ReportRange, @CurrentUser() user: AuthUser) {
    return this.reports.byProduct(range, user);
  }

  @Get("by-lender")
  byLender(@Query() range: ReportRange, @CurrentUser() user: AuthUser) {
    return this.reports.byLender(range, user);
  }

  @Get("by-officer")
  @Roles(Role.ADMIN, Role.MANAGER)
  byOfficer(@Query() range: ReportRange) {
    return this.reports.byOfficer(range);
  }

  /** Record-level rows for the report builder, plus the letterhead/summary shown above them. */
  @Get("records")
  async records(@Query("type") type: string, @Query() filters: RecordFilters, @CurrentUser() user: AuthUser) {
    const result = await this.reports.records(this.recordType(type, user), filters, user);
    return { ...result, meta: await this.reports.reportMeta(result.type, filters, result, user) };
  }

  /** The same report as a formatted Excel workbook (default) or a CSV with the same letterhead. */
  @Get("records/export")
  async exportRecords(
    @Query("type") type: string,
    @Query("columns") columns: string | undefined,
    @Query("format") format: string | undefined,
    @Query() filters: RecordFilters,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const result = await this.reports.records(this.recordType(type, user), filters, user, EXPORT_LIMIT);
    const wanted = columns ? new Set(columns.split(",")) : null;
    const picked = result.columns.filter((c) => !wanted || wanted.has(c.key));
    const meta = await this.reports.reportMeta(result.type, filters, result, user);
    const stamp = istToday();

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="gcs-${result.type}-${stamp}.csv"`);
      res.send(buildReportCsv(meta, picked, result.rows));
      return;
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="gcs-${result.type}-report-${stamp}.xlsx"`);
    res.send(await buildReportWorkbook(meta, picked, result.rows));
  }

  private recordType(type: string, user: AuthUser): RecordType {
    if (!RECORD_TYPES.includes(type as RecordType)) throw new BadRequestException("Unknown report type");
    if (type === "commissions" && user.role === Role.ADVISOR) {
      throw new ForbiddenException("Commission reports are for Admin and Super Admin");
    }
    return type as RecordType;
  }

  @Get("stalled")
  async stalled(@CurrentUser() user: AuthUser) {
    const rows = await this.reports.stalled(user);
    return rows.map((r) => ({
      id: r.id,
      applicationNo: this.settings.applicationNo(r.seq, r.createdAt),
      applicant: r.applicants[0]?.name ?? null,
      status: r.status,
      lender: r.lender?.name ?? null,
      owner: r.owner?.name ?? null,
      requestedAmount: r.requestedAmount,
      lastTouched: r.updatedAt,
    }));
  }

  /** Any of the tabular reports, as a CSV download. */
  @Get("export")
  async export(
    @Query("report") report: string,
    @Query() range: ReportRange,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const rows = await this.rowsFor(report, range, user);
    const stamp = istToday();

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gcs-${report}-${stamp}.csv"`);
    res.send(toCsv(rows));
  }

  private async rowsFor(report: string, range: ReportRange, user: AuthUser) {
    switch (report) {
      case "by-source":
        return this.reports.bySource(range, user);
      case "by-product":
        return this.reports.byProduct(range, user);
      case "by-lender":
        return this.reports.byLender(range, user);
      case "by-officer":
        // Advisors cannot see firm-wide officer performance, so give them their own row only.
        return user.role === Role.ADVISOR
          ? (await this.reports.byOfficer(range)).filter((r) => r.officer === user.name)
          : this.reports.byOfficer(range);
      case "funnel":
        return [await this.reports.funnel(range, user)];
      default:
        return [];
    }
  }
}
