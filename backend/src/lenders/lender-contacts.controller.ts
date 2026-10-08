import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { LenderContactsService } from "./lender-contacts.service";
import { CreateLenderContactDto, ListLenderContactsQuery, UpdateLenderContactDto } from "./dto/lender-contact.dto";

/** The bank / NBFC relationship-manager directory. Staff can look people up; admins keep it up to date. */
@Controller("lender-contacts")
export class LenderContactsController {
  constructor(private contacts: LenderContactsService) {}

  /** The loan types contacts can be filed under: the configured list, plus any already in use. */
  @Get("segments")
  segments() {
    return this.contacts.segments();
  }

  @Get()
  list(@Query() query: ListLenderContactsQuery) {
    return this.contacts.list(query);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateLenderContactDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.contacts.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param("id") id: string, @Body() dto: UpdateLenderContactDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.contacts.update(id, dto, user, ip);
  }

  @Delete(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.contacts.remove(id, user, ip);
  }
}
