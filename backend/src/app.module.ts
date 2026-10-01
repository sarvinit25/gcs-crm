import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard, PasswordChangeGuard, RolesGuard } from "./auth/auth.guards";
import { LeadsModule } from "./leads/leads.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ApplicationsModule } from "./applications/applications.module";
import { LendersModule } from "./lenders/lenders.module";
import { SanctionsModule } from "./sanctions/sanctions.module";
import { AuditModule } from "./audit/audit.module";
import { TeamModule } from "./team/team.module";
import { DocumentsModule } from "./documents/documents.module";
import { DisbursementsModule } from "./disbursements/disbursements.module";
import { CommissionsModule } from "./commissions/commissions.module";
import { ChecklistModule } from "./checklist/checklist.module";
import { EducationLoanDetailModule } from "./education-loan-detail/education-loan-detail.module";
import { PartnersModule } from "./partners/partners.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { ReportsModule } from "./reports/reports.module";
import { SettingsModule } from "./settings/settings.module";
import { PartnerPortalModule } from "./partner-portal/partner-portal.module";
import { BorrowerPortalModule } from "./borrower-portal/borrower-portal.module";
import { SearchModule } from "./search/search.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { MaintenanceModule } from "./maintenance/maintenance.module";
import { HealthModule } from "./health/health.module";
import { SecurityModule } from "./security/security.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Headroom for staff browsing; public intake and login tighten this per-route.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      // Test runs sign in dozens of times a minute; the one test about throttling turns it back on.
      skipIf: () => process.env.NODE_ENV === "test" && process.env.ENABLE_THROTTLE_IN_TESTS !== "true",
    }),
    PrismaModule,
    SecurityModule,
    AuthModule,
    LeadsModule,
    SearchModule,
    NotificationsModule,
    MaintenanceModule,
    HealthModule,
    DashboardModule,
    ApplicationsModule,
    LendersModule,
    SanctionsModule,
    AuditModule,
    TeamModule,
    DocumentsModule,
    DisbursementsModule,
    CommissionsModule,
    ChecklistModule,
    EducationLoanDetailModule,
    PartnersModule,
    AttendanceModule,
    ReportsModule,
    SettingsModule,
    PartnerPortalModule,
    BorrowerPortalModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Everything is authenticated unless a route opts out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
