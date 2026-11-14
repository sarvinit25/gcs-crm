import { Module } from "@nestjs/common";
import { LenderPoliciesController } from "./lender-policies.controller";
import { LenderPoliciesService } from "./lender-policies.service";
import { PolicySheetController } from "./policy-sheet.controller";
import { PolicySheetService } from "./policy-sheet.service";

@Module({
  controllers: [LenderPoliciesController, PolicySheetController],
  providers: [LenderPoliciesService, PolicySheetService],
  exports: [LenderPoliciesService, PolicySheetService],
})
export class LenderPoliciesModule {}
