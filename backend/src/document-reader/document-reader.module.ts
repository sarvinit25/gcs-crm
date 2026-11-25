import { Module } from "@nestjs/common";
import { CamModule } from "../cam/cam.module";
import { DocumentsModule } from "../documents/documents.module";
import { DocumentReaderController, LeadDocumentReaderController } from "./document-reader.controller";
import { DocumentReaderService } from "./document-reader.service";

@Module({
  imports: [DocumentsModule, CamModule],
  controllers: [DocumentReaderController, LeadDocumentReaderController],
  providers: [DocumentReaderService],
  exports: [DocumentReaderService],
})
export class DocumentReaderModule {}
