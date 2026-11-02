import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { ReportRecordsService } from "./report-records.service";
import { ReportInsightsService } from "./report-insights.service";
import { ReportTemplatesService } from "./report-templates.service";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportRecordsService, ReportInsightsService, ReportTemplatesService],
})
export class ReportsModule {}
