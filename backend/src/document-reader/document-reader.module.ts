import { Module } from "@nestjs/common";
import { CamModule } from "../cam/cam.module";
import { DocumentsModule } from "../documents/documents.module";
import { DocumentReaderController, LeadDocumentReaderController, ApplicationCamReaderController } from "./document-reader.controller";
import { DocumentReaderService } from "./document-reader.service";

@Module({
  imports: [DocumentsModule, CamModule],
  controllers: [DocumentReaderController, LeadDocumentReaderController, ApplicationCamReaderController],
  providers: [DocumentReaderService],
  exports: [DocumentReaderService],
})
export class DocumentReaderModule {}
