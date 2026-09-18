import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthModule } from "../auth/auth.module";
import { PartnerAuthController, PartnerPortalController } from "./partner-portal.controller";
import { PartnerAuthService } from "./partner-auth.service";
import { PartnerPortalService } from "./partner-portal.service";
import { PartnerJwtStrategy } from "./partner-jwt.strategy";

@Module({
  imports: [PassportModule, AuthModule],
  controllers: [PartnerAuthController, PartnerPortalController],
  providers: [PartnerAuthService, PartnerPortalService, PartnerJwtStrategy],
})
export class PartnerPortalModule {}
