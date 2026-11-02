import { Global, Module } from "@nestjs/common";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { MailService } from "./mail.service";

@Global()
@Module({ controllers: [AlertsController], providers: [MailService, AlertsService], exports: [MailService, AlertsService] })
export class AlertsModule {}
