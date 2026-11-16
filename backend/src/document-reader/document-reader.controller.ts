import { Controller, Get, Ip, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { DocumentReaderService } from "./document-reader.service";

/** What the documents on an application say, read by our statement reader or the AI, for staff to check. */
@Controller("applications/:applicationId/document-readings")
export class DocumentReaderController {
  constructor(private reader: DocumentReaderService) {}

  @Get()
  list(@Param("applicationId") id: string, @CurrentUser() user: AuthUser) {
    return this.reader.list(id, user);
  }

  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @Post("read-all")
  readAll(@Param("applicationId") id: string, @CurrentUser() user: AuthUser) {
    return this.reader.readAll(id, user);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(":documentId/read")
  read(@Param("applicationId") id: string, @Param("documentId") documentId: string, @CurrentUser() user: AuthUser) {
    return this.reader.readOne(id, documentId, user);
  }

  @Post(":documentId/add-to-cam")
  addToCam(@Param("applicationId") id: string, @Param("documentId") documentId: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.reader.addToCam(id, documentId, user, ip);
  }
}
