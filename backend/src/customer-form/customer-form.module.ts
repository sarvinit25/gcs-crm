import { Module } from "@nestjs/common";
import { AlertsModule } from "../alerts/alerts.module";
import { LoanProfileModule } from "../loan-profile/loan-profile.module";
import { ChecklistModule } from "../checklist/checklist.module";
import { DocumentsModule } from "../documents/documents.module";
import { CustomerFormPublicController, CustomerFormStaffController } from "./customer-form.controller";
import { CustomerFormService } from "./customer-form.service";

@Module({
  imports: [DocumentsModule, ChecklistModule, AlertsModule, LoanProfileModule],
  controllers: [CustomerFormStaffController, CustomerFormPublicController],
  providers: [CustomerFormService],
})
export class CustomerFormModule {}
