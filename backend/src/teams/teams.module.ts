import { Module } from "@nestjs/common";
import { LeadAssignmentService } from "./lead-assignment.service";
import { TeamsController } from "./teams.controller";
import { TeamsService } from "./teams.service";

@Module({
  controllers: [TeamsController],
  providers: [TeamsService, LeadAssignmentService],
  exports: [LeadAssignmentService],
})
export class TeamsModule {}
