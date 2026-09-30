import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { TeamService } from "./team.service";
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from "./dto/team.dto";

@Controller("team")
export class TeamController {
  constructor(private team: TeamService) {}

  /** Names for assignment dropdowns — readable by any signed-in staff member. */
  @Get("assignable")
  findAssignable() {
    return this.team.findAssignable();
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll(@Query("includeInactive") includeInactive?: string) {
    return this.team.findAll(includeInactive === "true");
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.team.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.team.update(id, dto, user, ip);
  }

  @Post(":id/reset-2fa")
  @Roles(Role.ADMIN)
  resetTwoFactor(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.team.resetTwoFactor(id, user, ip);
  }

  @Post(":id/reset-password")
  @Roles(Role.ADMIN)
  resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.team.resetPassword(id, dto.password, user, ip);
  }
}
