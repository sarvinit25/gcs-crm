import { Controller, Get, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../auth/auth.decorators";
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
}
