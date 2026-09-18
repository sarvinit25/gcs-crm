import { Module } from "@nestjs/common";
import {
  ApplicationDisbursementsController,
  DisbursementsController,
} from "./disbursements.controller";
import { DisbursementsService } from "./disbursements.service";

@Module({
  controllers: [DisbursementsController, ApplicationDisbursementsController],
  providers: [DisbursementsService],
})
export class DisbursementsModule {}
