import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard, RolesGuard } from "./auth/auth.guards";
import { LeadsModule } from "./leads/leads.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ApplicationsModule } from "./applications/applications.module";
import { LendersModule } from "./lenders/lenders.module";
import { SanctionsModule } from "./sanctions/sanctions.module";
import { AuditModule } from "./audit/audit.module";
import { TeamModule } from "./team/team.module";
import { DocumentsModule } from "./documents/documents.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Headroom for staff browsing; public intake and login tighten this per-route.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
    PrismaModule,
    AuthModule,
    LeadsModule,
    DashboardModule,
    ApplicationsModule,
    LendersModule,
    SanctionsModule,
    AuditModule,
    TeamModule,
    DocumentsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Everything is authenticated unless a route opts out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
