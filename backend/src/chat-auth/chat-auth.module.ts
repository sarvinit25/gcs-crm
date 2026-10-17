import { Module } from "@nestjs/common";
import { AlertsModule } from "../alerts/alerts.module";
import { LeadsModule } from "../leads/leads.module";
import { ChatAuthController } from "./chat-auth.controller";
import { ChatAuthService } from "./chat-auth.service";
import { IdRecoveryController } from "./id-recovery.controller";
import { IdRecoveryService } from "./id-recovery.service";
import { OtpSenderService } from "./otp-sender.service";

@Module({
  imports: [LeadsModule, AlertsModule],
  controllers: [ChatAuthController, IdRecoveryController],
  providers: [ChatAuthService, IdRecoveryService, OtpSenderService],
})
export class ChatAuthModule {}
