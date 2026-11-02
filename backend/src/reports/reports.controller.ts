import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { ReportsService, type ReportRange } from "./reports.service";
import { PREVIEW_LIMIT, pickRows, ReportRecordsService, type RecordFilters } from "./report-records.service";
import { ReportInsightsService, type DetailFilters } from "./report-insights.service";
import { ReportTemplatesService } from "./report-templates.service";
import { SaveReportTemplateDto } from "./dto/report-template.dto";
import { canSeeCommission, catalogueFor, isRecordType, resolveColumns, type RecordType } from "./report-catalogue";
import { SettingsService } from "../settings/settings.service";
import { toCsv } from "../common/csv.util";
import { istToday } from "../common/date.util";
import { buildReportCsv, buildReportWorkbook } from "./report-workbook";

@Controller("reports")
export class ReportsController {
  constructor(
    private reports: ReportsService,
    private records_: ReportRecordsService,
    private insights: ReportInsightsService,
    private templates: ReportTemplatesService,
    private settings: SettingsService,
  ) {}

  /** The Reports landing page: headline numbers, trends, pipeline, lenders and (Admin/Manager) commission. */
  @Get("hub")
  hub(@Query() range: ReportRange, @CurrentUser() user: AuthUser) {
    return this.insights.hub(range, user);
  }

  /** One of the eight detailed reports (leads, callbacks, files, login-files, sanctions, disbursals, rejects, commissions). */
  @Get("detail/:kind")
  detail(@Param("kind") kind: string, @Query() filters: DetailFilters, @CurrentUser() user: AuthUser) {
    return this.insights.detail(kind, filters, user);
  }

  /** Every column an export can contain, grouped by section — only what the caller is allowed to see. */
  @Get("catalogue")
  catalogue(@CurrentUser() user: AuthUser) {
    return catalogueFor(user.role);
  }

  /** The caller's own saved column templates, optionally for one register. */
  @Get("templates")
  listTemplates(@Query("type") type: string | undefined, @CurrentUser() user: AuthUser) {
    return this.templates.list(user, type);
  }

  @Post("templates")
  saveTemplate(@Body() dto: SaveReportTemplateDto, @CurrentUser() user: AuthUser) {
    return this.templates.save(user, dto);
  }

  @Delete("templates/:id")
  removeTemplate(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.templates.remove(user, id);
  }

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
  async records(
    @Query("type") type: string,
    @Query("columns") columns: string | undefined,
    @Query() filters: RecordFilters,
    @CurrentUser() user: AuthUser,
  ) {
    const kind = this.recordType(type, user);
    const result = await this.records_.records(kind, filters, user, PREVIEW_LIMIT, columns ? columns.split(",") : undefined);
    const meta = await this.records_.reportMeta(kind, filters, result, user);
    return { ...result, rows: pickRows(result.rows, result.columns), meta };
  }

  /**
   * The same report as a formatted Excel workbook (default) or a CSV with the same letterhead. Columns come from a
   * saved template (`templateId`, the caller's own only), an explicit list (`columns`), or the standard set. The
   * list's own filters are honoured, and every matching record is exported — there is no row cap.
   */
  @Get("records/export")
  async exportRecords(
    @Query("type") type: string,
    @Query("columns") columns: string | undefined,
    @Query("templateId") templateId: string | undefined,
    @Query("format") format: string | undefined,
    @Query() filters: RecordFilters,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const kind = this.recordType(type, user);
    let wanted: string[] | undefined = columns ? columns.split(",").filter(Boolean) : undefined;
    if (templateId) wanted = (await this.templates.mine(user, templateId, kind)).columns;
    if (wanted && !resolveColumns(kind, user.role, wanted).length) {
      throw new BadRequestException("None of the requested columns are available");
    }

    const result = await this.records_.records(kind, filters, user, null, wanted);
    const meta = await this.records_.reportMeta(kind, filters, result, user);
    const stamp = istToday();

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="gcs-${kind}-${stamp}.csv"`);
      res.send(buildReportCsv(meta, result.columns, result.rows));
      return;
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="gcs-${kind}-report-${stamp}.xlsx"`);
    res.send(await buildReportWorkbook(meta, result.columns, result.rows));
  }

  private recordType(type: string, user: AuthUser): RecordType {
    if (!isRecordType(type)) throw new BadRequestException("Unknown report type");
    if (type === "commissions" && !canSeeCommission(user.role)) {
      throw new ForbiddenException("Commission reports are for Admin and Manager");
    }
    return type;
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
