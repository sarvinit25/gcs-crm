import { Module } from "@nestjs/common";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { DocumentsModule } from "../documents/documents.module";
import { LeadHandoff } from "./lead-handoff";
import { DocumentReaderModule } from "../document-reader/document-reader.module";

@Module({
  imports: [DocumentsModule, DocumentReaderModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, LeadHandoff],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
