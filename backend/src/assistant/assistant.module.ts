import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { ApplicationsModule } from "../applications/applications.module";
import { SearchModule } from "../search/search.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [LeadsModule, ApplicationsModule, SearchModule],
  controllers: [AssistantController],
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
