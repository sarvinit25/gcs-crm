import { Module } from "@nestjs/common";
import {
  ApplicationDisbursementsController,
  ApplicationMoneyTrailController,
  DisbursementsController,
} from "./disbursements.controller";
import { DisbursementsService } from "./disbursements.service";

@Module({
  controllers: [DisbursementsController, ApplicationDisbursementsController, ApplicationMoneyTrailController],
  providers: [DisbursementsService],
})
export class DisbursementsModule {}
