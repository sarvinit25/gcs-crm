import { Module } from "@nestjs/common";
import { LenderPoliciesController } from "./lender-policies.controller";
import { LenderPoliciesService } from "./lender-policies.service";

@Module({
  controllers: [LenderPoliciesController],
  providers: [LenderPoliciesService],
})
export class LenderPoliciesModule {}
