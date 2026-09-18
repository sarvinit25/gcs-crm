import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard, RolesGuard } from "./auth/auth.guards";
import { LeadsModule } from "./leads/leads.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ApplicationsModule } from "./applications/applications.module";
import { LendersModule } from "./lenders/lenders.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    LeadsModule,
    DashboardModule,
    ApplicationsModule,
    LendersModule,
  ],
  providers: [
    // Everything is authenticated unless a route opts out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
