import { Module } from "@nestjs/common";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { DocumentsModule } from "../documents/documents.module";
import { LeadHandoff } from "./lead-handoff";

@Module({
  imports: [DocumentsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, LeadHandoff],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
