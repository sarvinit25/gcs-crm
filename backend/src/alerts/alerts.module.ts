import { Global, Module } from "@nestjs/common";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { MailService } from "./mail.service";
import { DocsReminderService } from "./docs-reminder.service";
import { StepAlertsService } from "./step-alerts.service";

@Global()
@Module({ controllers: [AlertsController], providers: [MailService, AlertsService, StepAlertsService, DocsReminderService], exports: [MailService, AlertsService] })
export class AlertsModule {}
