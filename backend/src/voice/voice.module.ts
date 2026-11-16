import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { VoiceWebhookController } from "./voice.controller";
import { VoiceCallsController } from "./voice-calls.controller";
import { VoiceService } from "./voice.service";

@Module({
  imports: [LeadsModule],
  controllers: [VoiceWebhookController, VoiceCallsController],
  providers: [VoiceService],
})
export class VoiceModule {}
