import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { LeadSourcesService } from "./lead-sources.service";
import { CreateLeadSourceDto, UpdateLeadSourceDto } from "./dto/lead-source.dto";

/** Admin screen for the list of places leads come from. Everyone signed in reads the active list through /marketing/channels. */
@Controller("lead-sources")
export class LeadSourcesController {
  constructor(private sources: LeadSourcesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  list(@Query("includeInactive") includeInactive?: string) {
    return this.sources.list({ includeInactive: includeInactive !== "false" });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateLeadSourceDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.sources.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateLeadSourceDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.sources.update(id, dto, user, ip);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.sources.remove(id, user, ip);
  }
}
