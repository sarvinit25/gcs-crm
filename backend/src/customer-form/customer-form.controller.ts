import { Body, Controller, Delete, Get, Headers, Ip, Param, Post, Put, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, Public, type AuthUser } from "../auth/auth.decorators";
import { MAX_FILE_BYTES } from "../documents/documents.service";
import { CustomerFormService } from "./customer-form.service";
import { EmailLinkDto, FormCodeRequestDto, FormCodeVerifyDto, SaveFormDto, SubmitFormDto } from "./dto/customer-form.dto";

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

  /** Emails the live link to the applicant. The browser sends the full address it shows staff; the server checks it. */
  @Post("email")
  email(@Param("applicationId") id: string, @Body() dto: EmailLinkDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.forms.emailLink(id, dto.url, user, ip);
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
  view(@Param("token") token: string, @Headers("x-form-session") session?: string) {
    return this.forms.view(token, session);
  }

  /** Emails the one-time code to the address we hold for this application. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("code")
  sendCode(@Param("token") token: string, @Body() dto: FormCodeRequestDto) {
    return this.forms.sendCode(token, dto.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("verify")
  verify(@Param("token") token: string, @Body() dto: FormCodeVerifyDto) {
    return this.forms.verifyCode(token, dto.email, dto.code);
  }

  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  @Put()
  save(@Param("token") token: string, @Body() dto: SaveFormDto, @Headers("x-form-session") session?: string) {
    return this.forms.save(token, dto, session);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("documents")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(@Param("token") token: string, @UploadedFile() file: Express.Multer.File, @Body("category") category?: string, @Headers("x-form-session") session?: string) {
    return this.forms.upload(token, file, category, session);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete("documents/:documentId")
  removeDocument(@Param("token") token: string, @Param("documentId") documentId: string, @Headers("x-form-session") session?: string) {
    return this.forms.removeDocument(token, documentId, session);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post("submit")
  submit(@Param("token") token: string, @Body() _dto: SubmitFormDto, @Headers("x-form-session") session?: string) {
    return this.forms.submit(token, session);
  }
}
