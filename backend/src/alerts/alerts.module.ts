import { Global, Module } from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { MailService } from "./mail.service";

@Global()
@Module({ providers: [MailService, AlertsService], exports: [MailService, AlertsService] })
export class AlertsModule {}
