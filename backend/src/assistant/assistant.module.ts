import { Module } from "@nestjs/common";
import { AssistantController } from "./assistant.controller";
import { ASSISTANT_MODEL, OpenAiAssistantModel } from "./assistant.model";
import { AssistantService } from "./assistant.service";
import { AssistantTools } from "./assistant.tools";

@Module({
  controllers: [AssistantController],
  exports: [AssistantService],
  providers: [AssistantService, AssistantTools, { provide: ASSISTANT_MODEL, useClass: OpenAiAssistantModel }],
})
export class AssistantModule {}
