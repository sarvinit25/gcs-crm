import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { ReportsService, type ReportRange } from "./reports.service";
import { formatApplicationNo } from "../applications/applications.service";

/** Escapes a value for CSV — quotes doubled, field wrapped when it needs it. */
function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(",")),
  ].join("\n");
}

@Controller("reports")
export class ReportsController {
  constructor(private reports: ReportsService) {}

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

  @Get("stalled")
  async stalled(@CurrentUser() user: AuthUser) {
    const rows = await this.reports.stalled(user);
    return rows.map((r) => ({
      id: r.id,
      applicationNo: formatApplicationNo(r.seq, r.createdAt),
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
    const stamp = new Date().toISOString().slice(0, 10);

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
