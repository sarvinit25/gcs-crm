import { Module } from "@nestjs/common";
import {
  ApplicationChecklistController,
  ChecklistItemsAdminController,
} from "./checklist.controller";
import { ChecklistService } from "./checklist.service";

@Module({
  controllers: [ApplicationChecklistController, ChecklistItemsAdminController],
  providers: [ChecklistService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
