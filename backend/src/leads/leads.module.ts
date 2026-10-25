import { Module } from "@nestjs/common";
import { LeadsController, PublicLeadsController } from "./leads.controller";
import { TeamsModule } from "../teams/teams.module";
import { LeadSourcesModule } from "../lead-sources/lead-sources.module";
import { LeadsService } from "./leads.service";
import { TurnstileService } from "./turnstile.service";

@Module({
  imports: [TeamsModule, LeadSourcesModule],
  controllers: [LeadsController, PublicLeadsController],
  providers: [LeadsService, TurnstileService],
  exports: [LeadsService, TurnstileService],
})
export class LeadsModule {}
