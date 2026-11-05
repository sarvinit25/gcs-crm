import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { AssistantModule } from "../assistant/assistant.module";
import { BriefsService } from "./briefs.service";
import { ConversationsService } from "./conversations.service";
import { InboundService } from "./inbound.service";
import { IntakeService } from "./intake/intake.service";
import { NotificationEngine } from "./notification-engine.service";
import { TemplatesService } from "./templates.service";
import {
  ConversationsController,
  NotificationLogsController,
  TemplatesController,
  WhatsAppSetupController,
  WhatsAppWebhookController,
} from "./whatsapp.controller";
import { WHATSAPP_PROVIDER, createWhatsAppProvider } from "./whatsapp.provider";

@Module({
  imports: [LeadsModule, AssistantModule],
  controllers: [
    WhatsAppWebhookController,
    ConversationsController,
    TemplatesController,
    NotificationLogsController,
    WhatsAppSetupController,
  ],
  providers: [
    { provide: WHATSAPP_PROVIDER, useFactory: createWhatsAppProvider },
    ConversationsService,
    InboundService,
    IntakeService,
    NotificationEngine,
    TemplatesService,
    BriefsService,
  ],
  exports: [WHATSAPP_PROVIDER, ConversationsService],
})
export class WhatsAppModule {}
