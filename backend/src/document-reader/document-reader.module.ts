import { Module } from "@nestjs/common";
import { CamModule } from "../cam/cam.module";
import { DocumentsModule } from "../documents/documents.module";
import { DocumentReaderController } from "./document-reader.controller";
import { DocumentReaderService } from "./document-reader.service";

@Module({
  imports: [DocumentsModule, CamModule],
  controllers: [DocumentReaderController],
  providers: [DocumentReaderService],
})
export class DocumentReaderModule {}
