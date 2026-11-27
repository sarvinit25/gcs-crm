import { Controller, Get, Ip, Param, StreamableFile } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { FilePackService } from "./file-pack.service";

const download = (buffer: Buffer, type: string, fileName: string) =>
  new StreamableFile(buffer, { type, length: buffer.length, disposition: `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}` });

/** Download a loan file: its report, or everything on it in one ZIP. Advisers reach only their own files. */
@Controller("applications/:id")
export class FilePackController {
  constructor(private packs: FilePackService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get("report.pdf")
  async report(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    const f = await this.packs.report(id, user, ip);
    return download(f.buffer, "application/pdf", f.fileName);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get("pack.zip")
  async pack(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    const f = await this.packs.pack(id, user, ip);
    return download(f.buffer, "application/zip", f.fileName);
  }
}
