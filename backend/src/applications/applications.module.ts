import { Module } from "@nestjs/common";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";
import { DocumentsModule } from "../documents/documents.module";
import { LeadHandoff } from "./lead-handoff";
import { CamModule } from "../cam/cam.module";
import { FilePackController } from "./file-pack.controller";
import { FilePackService } from "./file-pack.service";
import { DocumentReaderModule } from "../document-reader/document-reader.module";

@Module({
  imports: [DocumentsModule, DocumentReaderModule, CamModule],
  controllers: [ApplicationsController, FilePackController],
  providers: [ApplicationsService, LeadHandoff, FilePackService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
