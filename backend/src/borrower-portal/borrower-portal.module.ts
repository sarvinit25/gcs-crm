import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthModule } from "../auth/auth.module";
import { BorrowerAuthController, BorrowerPortalController } from "./borrower-portal.controller";
import { BorrowerAuthService } from "./borrower-auth.service";
import { BorrowerPortalService } from "./borrower-portal.service";
import { BorrowerJwtStrategy } from "./borrower-jwt.strategy";

@Module({
  imports: [PassportModule, AuthModule],
  controllers: [BorrowerAuthController, BorrowerPortalController],
  providers: [BorrowerAuthService, BorrowerPortalService, BorrowerJwtStrategy],
})
export class BorrowerPortalModule {}
