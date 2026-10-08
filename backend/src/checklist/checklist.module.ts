import { Module } from "@nestjs/common";
import {
  ApplicationChecklistController,
  ChecklistItemsAdminController,
} from "./checklist.controller";
import {
  ChecklistDocumentsAdminController,
  PublicChecklistDocumentsController,
} from "./checklist-documents.controller";
import { ChecklistService } from "./checklist.service";

@Module({
  controllers: [
    ApplicationChecklistController,
    ChecklistItemsAdminController,
    ChecklistDocumentsAdminController,
    PublicChecklistDocumentsController,
  ],
  providers: [ChecklistService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
