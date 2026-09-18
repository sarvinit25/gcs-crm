import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { PartnersService } from "./partners.service";
import { CreatePartnerDto, UpdatePartnerDto } from "./dto/partner.dto";

@Controller("partners")
export class PartnersController {
  constructor(private partners: PartnersService) {}

  /** Referral dropdown on a lead — readable by any signed-in staff member. */
  @Get("assignable")
  findAssignable() {
    return this.partners.findAssignable();
  }

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll(@Query("includeInactive") includeInactive?: string) {
    return this.partners.findAll(includeInactive === "true");
  }

  @Get(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  findOne(@Param("id") id: string) {
    return this.partners.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreatePartnerDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.partners.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  update(
    @Param("id") id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.partners.update(id, dto, user, ip);
  }
}
