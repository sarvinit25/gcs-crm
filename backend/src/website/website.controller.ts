import { Controller, Delete, Get, Ip, Param, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { WebsiteService } from "./website.service";
import { ListSubmissionsQuery } from "./dto/website.dto";

/** Managers and admins see the whole inbox; staff work from the leads assigned to them. */
@Controller("website-submissions")
export class WebsiteController {
  constructor(private website: WebsiteService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get()
  list(@Query() q: ListSubmissionsQuery) {
    return this.website.list(q);
  }

  /**
   * Deletes one website entry for good. With `withLead=true` the lead it created goes too, unless that lead already has a
   * loan file, in which case nothing is deleted and the answer says why.
   */
  @Roles(Role.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string, @Query("withLead") withLead: string | undefined, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.website.remove(id, withLead === "true", user, ip);
  }
}
