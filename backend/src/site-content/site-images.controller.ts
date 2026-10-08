import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/auth.decorators";
import { detectFile, safeFileName } from "../documents/file-sniff";
import { PrismaService } from "../prisma/prisma.service";

/** Website pictures are shown at once on a page, so keep them small. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Admin: upload a replacement picture for the website. */
@Controller("settings/site-images")
export class SiteImagesAdminController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_BYTES + 1 } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthUser) {
    if (!file) throw new BadRequestException("Choose a picture to upload");
    if (file.size > MAX_IMAGE_BYTES) throw new PayloadTooLargeException("The picture must be 2 MB or smaller");
    const kind = detectFile(file.buffer);
    if (!kind || !IMAGE_TYPES.has(kind.mime)) {
      throw new BadRequestException("The picture must be a PNG, JPG or WebP image");
    }
    const image = await this.prisma.siteImage.create({
      data: {
        name: safeFileName(file.originalname, kind.extension),
        mime: kind.mime,
        data: new Uint8Array(file.buffer),
        createdByName: user.name,
      },
      select: { id: true },
    });
    return { id: image.id, path: `/public/site-images/${image.id}` };
  }
}

/** Public: serves an uploaded picture to the website. */
@Controller("public/site-images")
export class PublicSiteImagesController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get(":id")
  async image(@Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const image = await this.prisma.siteImage.findUnique({ where: { id } });
    if (!image) throw new NotFoundException();
    // The website is on another origin in development; helmet's default would block the picture.
    res.set({
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=86400, immutable",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    return new StreamableFile(Buffer.from(image.data));
  }
}
