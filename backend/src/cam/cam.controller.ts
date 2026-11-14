import { Body, Controller, Delete, Get, Header, Ip, Param, Post, Put, Query, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, Public, type AuthUser } from "../auth/auth.decorators";
import { CamService } from "./cam.service";
import { MAX_STATEMENT_BYTES } from "./statement-read";

/** Staff: every CAM in one list, for the CAM page. */
@Controller("cams")
export class CamListController {
  constructor(private cam: CamService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("search") search?: string) {
    return this.cam.list(user, search);
  }
}

/** Staff: fill in the CAM, send or withdraw the customer's link, download the Excel. */
@Controller("leads/:leadId/cam")
export class CamController {
  constructor(private cam: CamService) {}

  @Get()
  get(@Param("leadId") id: string, @CurrentUser() user: AuthUser) {
    return this.cam.get(id, user);
  }

  @Put()
  save(@Param("leadId") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.cam.save(id, body, user, ip);
  }

  @Post("link")
  link(@Param("leadId") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.cam.createLink(id, user, ip);
  }

  @Delete("link")
  revoke(@Param("leadId") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.cam.revokeLink(id, user, ip);
  }

  /** Reads an uploaded bank statement and returns its figures for the CAM. Nothing is saved: staff look at it, then apply it. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("statement")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_STATEMENT_BYTES } }))
  statement(@Param("leadId") id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthUser) {
    return this.cam.readStatement(id, file, user);
  }

  @Get("export")
  @Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  async export(@Param("leadId") id: string, @CurrentUser() user: AuthUser) {
    const { buffer, fileName } = await this.cam.exportXlsx(id, user);
    return new StreamableFile(buffer, { disposition: `attachment; filename="${fileName}"` });
  }
}

/**
 * The customer's side. No login: the 256-bit token in the link is the credential, so these are throttled per address
 * and a bad token gets the same answer as an unknown one.
 */
@Public()
@Controller("public/cam/:token")
export class CamPublicController {
  constructor(private cam: CamService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  view(@Param("token") token: string) {
    return this.cam.viewPublic(token);
  }

  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  @Put()
  save(@Param("token") token: string, @Body() body: unknown) {
    return this.cam.savePublic(token, body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("submit")
  submit(@Param("token") token: string, @Body() body: unknown) {
    return this.cam.submitPublic(token, body);
  }
}
