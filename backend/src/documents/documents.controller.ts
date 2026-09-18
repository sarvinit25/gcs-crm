import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { DocumentsService, DOCUMENT_CATEGORIES, MAX_FILE_BYTES } from "./documents.service";

@Controller("applications/:applicationId/documents")
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Get("categories")
  categories() {
    return DOCUMENT_CATEGORIES;
  }

  @Get()
  list(@Param("applicationId") applicationId: string, @CurrentUser() user: AuthUser) {
    return this.documents.list(applicationId, user);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE_BYTES } }))
  upload(
    @Param("applicationId") applicationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("category") category: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.documents.upload(applicationId, file, category || "Other", user, ip);
  }

  @Get(":documentId/download")
  download(
    @Param("applicationId") applicationId: string,
    @Param("documentId") documentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.documents.downloadUrl(applicationId, documentId, user);
  }

  @Delete(":documentId")
  remove(
    @Param("applicationId") applicationId: string,
    @Param("documentId") documentId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.documents.remove(applicationId, documentId, user, ip);
  }
}
