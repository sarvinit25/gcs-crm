import { Module } from "@nestjs/common";
import {
  CommissionsController,
  DisbursementCommissionController,
} from "./commissions.controller";
import { CommissionsService } from "./commissions.service";

@Module({
  controllers: [CommissionsController, DisbursementCommissionController],
  providers: [CommissionsService],
})
export class CommissionsModule {}
