import {
  Body, Controller, Delete, Get, Ip, Param, Patch, Post, Res, StreamableFile, UploadedFile, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/auth.decorators";
import { AdsService, MAX_AD_BYTES } from "./ads.service";
import { CreateAdDto, UpdateAdDto } from "./dto/ads.dto";

/** Staff side: upload a poster, choose its dates, pause or remove it. */
@Controller("website-ads")
@Roles(Role.ADMIN, Role.MANAGER)
export class AdsController {
  constructor(private ads: AdsService) {}

  @Get()
  list() {
    return this.ads.list();
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_AD_BYTES + 1 } }))
  create(@UploadedFile() file: Express.Multer.File | undefined, @Body() dto: CreateAdDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.ads.create(file, dto, user, ip);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAdDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.ads.update(id, dto, user, ip);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.ads.remove(id, user, ip);
  }

  @Get(":id/image")
  async image(@Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const { body, mime } = await this.ads.image(id);
    res.set({ "Content-Type": mime, "Cache-Control": "private, max-age=300" });
    return new StreamableFile(body);
  }
}

/** Public side: what the website pop-up asks for. Nothing here reveals a scheduled or paused ad. */
@Controller("public/website-ad")
export class PublicAdController {
  constructor(private ads: AdsService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  async live(@Res({ passthrough: true }) res: Response) {
    res.set("Cache-Control", "public, max-age=60");
    return this.ads.live();
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(":id/image")
  async image(@Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const { body, mime } = await this.ads.liveImage(id);
    // The website is on another origin; helmet's default would stop it showing this picture.
    res.set({ "Content-Type": mime, "Cache-Control": "public, max-age=3600", "Cross-Origin-Resource-Policy": "cross-origin" });
    return new StreamableFile(body);
  }
}
