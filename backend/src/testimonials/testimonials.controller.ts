import { Body, Controller, Get, Ip, Param, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/auth.decorators";
import { MAX_PHOTO_BYTES, TestimonialsService } from "./testimonials.service";

/** The page a client opens from a link: no login. Slow by design, and nothing it receives is published. */
@Controller("public/testimonials")
export class PublicTestimonialsController {
  constructor(private testimonials: TestimonialsService) {}

  @Public()
  @Throttle({ default: { limit: 4, ttl: 600_000 } })
  @Post()
  @UseInterceptors(FileInterceptor("photo", { limits: { fileSize: MAX_PHOTO_BYTES + 1, files: 1 } }))
  submit(@Body() body: Record<string, unknown>, @UploadedFile() photo: Express.Multer.File | undefined, @Ip() ip: string) {
    return this.testimonials.submit(body ?? {}, photo, ip);
  }
}

/** Staff: look through what clients sent, then use it or not. */
@Controller("testimonial-submissions")
@Roles(Role.ADMIN, Role.MANAGER)
export class TestimonialSubmissionsController {
  constructor(private testimonials: TestimonialsService) {}

  @Get()
  list() {
    return this.testimonials.list();
  }

  /** The private photo, for staff only. It is fetched with the login, never linked from a public address. */
  @Get(":id/photo")
  async photo(@Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const p = await this.testimonials.photo(id);
    res.set({ "Content-Type": p.mime, "Cache-Control": "private, no-store" });
    return new StreamableFile(p.buffer);
  }

  @Post(":id/approve")
  approve(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.testimonials.approve(id, user, ip);
  }

  @Post(":id/reject")
  reject(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.testimonials.reject(id, user, ip);
  }
}
