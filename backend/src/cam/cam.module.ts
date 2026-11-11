import { Module } from "@nestjs/common";
import { LenderPoliciesModule } from "../lender-policies/lender-policies.module";
import { CamController, CamListController, CamPublicController } from "./cam.controller";
import { CamService } from "./cam.service";

@Module({
  imports: [LenderPoliciesModule],
  controllers: [CamController, CamListController, CamPublicController],
  providers: [CamService],
})
export class CamModule {}
