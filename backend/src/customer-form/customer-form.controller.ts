import { Body, Controller, Delete, Get, Ip, Param, Post, Put, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, Public, type AuthUser } from "../auth/auth.decorators";
import { MAX_FILE_BYTES } from "../documents/documents.service";
import { CustomerFormService } from "./customer-form.service";
import { SaveFormDto, SubmitFormDto } from "./dto/customer-form.dto";

/** Staff: send, re-send or withdraw the link for one application. */
@Controller("applications/:applicationId/customer-form")
export class CustomerFormStaffController {
  constructor(private forms: CustomerFormService) {}

  @Get()
  status(@Param("applicationId") id: string, @CurrentUser() user: AuthUser) {
    return this.forms.status(id, user);
  }

  @Post()
  create(@Param("applicationId") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.forms.create(id, user, ip);
  }

  @Delete()
  revoke(@Param("applicationId") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.forms.revoke(id, user, ip);
  }
}

/**
 * The customer's own side. No login: the 256-bit token in the link is the
 * credential, so these are throttled per address and answer a bad token with
 * the same message as an unknown one.
 */
@Public()
@Controller("public/apply/:token")
export class CustomerFormPublicController {
  constructor(private forms: CustomerFormService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  view(@Param("token") token: string) {
    return this.forms.view(token);
  }

  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  @Put()
  save(@Param("token") token: string, @Body() dto: SaveFormDto) {
    return this.forms.save(token, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("documents")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(@Param("token") token: string, @UploadedFile() file: Express.Multer.File, @Body("category") category?: string) {
    return this.forms.upload(token, file, category);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete("documents/:documentId")
  removeDocument(@Param("token") token: string, @Param("documentId") documentId: string) {
    return this.forms.removeDocument(token, documentId);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post("submit")
  submit(@Param("token") token: string, @Body() _dto: SubmitFormDto) {
    return this.forms.submit(token);
  }
}
