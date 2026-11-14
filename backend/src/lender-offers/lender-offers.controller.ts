import { Body, Controller, Get, Ip, Param, Patch, Post, Query, StreamableFile, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { LenderOffersService } from "./lender-offers.service";

/** Reading lender flyers into draft terms, and adding the reviewed ones to Lender match. Admins and managers only. */
@Controller("lender-offers")
@Roles(Role.ADMIN, Role.MANAGER)
export class LenderOffersController {
  constructor(private offers: LenderOffersService) {}

  @Get()
  list(@Query("status") status?: string, @Query("lenderId") lenderId?: string) {
    return this.offers.list(status, lenderId);
  }

  @Post()
  @UseInterceptors(FilesInterceptor("files", 20, { limits: { fileSize: 100 * 1024 * 1024 } }))
  create(@UploadedFiles() files: Express.Multer.File[] | undefined, @Body() body: { text?: string }, @CurrentUser() user: AuthUser) {
    return this.offers.create(files ?? [], body?.text, user);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.offers.get(id);
  }

  @Get(":id/file")
  file(@Param("id") id: string) {
    return this.offers.fileUrl(id);
  }

  /** The original file itself, to be shown beside what was read from it. Shown inline, not downloaded. */
  @Get(":id/file/content")
  async fileContent(@Param("id") id: string) {
    const f = await this.offers.fileContent(id);
    return new StreamableFile(f.buffer, { type: f.mime, disposition: `inline; filename="${f.name.replace(/"/g, "")}"` });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.offers.update(id, body, user);
  }

  @Post(":id/apply")
  apply(@Param("id") id: string, @Body() body: { lenderId?: string; newLenderName?: string }, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.offers.apply(id, body ?? {}, user, ip);
  }

  @Post(":id/discard")
  discard(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.offers.discard(id, user);
  }
}
