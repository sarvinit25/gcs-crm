import { Body, Controller, Get, Ip, Post, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { MaintenanceService } from "./maintenance.service";

class ArchiveDto {
  /** Archive closed files that have not been touched for at least this many months. */
  @Type(() => Number) @IsInt() @Min(3) @Max(240) months: number;
}

@Controller("maintenance")
@Roles(Role.ADMIN)
export class MaintenanceController {
  constructor(private maintenance: MaintenanceService) {}

  /** How many files an archive run would touch — a dry run, nothing changes. */
  @Get("archive-preview")
  preview(@Query() q: ArchiveDto) {
    return this.maintenance.preview(q.months);
  }

  @Post("archive")
  archive(@Body() dto: ArchiveDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.maintenance.archive(dto.months, user, ip);
  }
}
