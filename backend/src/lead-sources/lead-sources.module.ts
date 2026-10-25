import { Module } from "@nestjs/common";
import { LeadSourcesController } from "./lead-sources.controller";
import { LeadSourcesService } from "./lead-sources.service";

@Module({ controllers: [LeadSourcesController], providers: [LeadSourcesService], exports: [LeadSourcesService] })
export class LeadSourcesModule {}
