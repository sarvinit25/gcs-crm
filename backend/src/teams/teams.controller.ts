import { Body, Controller, Delete, Get, Ip, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { TeamsService } from "./teams.service";
import { CreateTeamDto, UpdateTeamDto } from "./dto/team.dto";

/** Admin screen for teams: who works together, who leads them. The on/off switches beside it are ordinary settings. */
@Controller("teams")
export class TeamsController {
  constructor(private teams: TeamsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  list() {
    return this.teams.list();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateTeamDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.teams.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateTeamDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.teams.update(id, dto, user, ip);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.teams.remove(id, user, ip);
  }
}
