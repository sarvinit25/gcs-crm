import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { LoanProfileController, PublicLoanProfileController } from "./loan-profile.controller";
import { LoanProfileService } from "./loan-profile.service";
import { ProfileAiService } from "./profile-ai.service";

@Module({
  imports: [LeadsModule],
  controllers: [LoanProfileController, PublicLoanProfileController],
  providers: [LoanProfileService, ProfileAiService],
  exports: [LoanProfileService],
})
export class LoanProfileModule {}
