import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { PartnersService } from "./partners.service";
import {
  ApprovePartnerApplicationDto,
  CreatePartnerDto,
  SetPartnerPasswordDto,
  UpdatePartnerApplicationDto,
  UpdatePartnerDto,
} from "./dto/partner.dto";

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

  /** People who asked to become a partner on the website. */
  @Get("applications")
  @Roles(Role.ADMIN, Role.MANAGER)
  applications(@Query("status") status?: string) {
    return this.partners.applications(status);
  }

  @Patch("applications/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  updateApplication(
    @Param("id") id: string,
    @Body() dto: UpdatePartnerApplicationDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.partners.updateApplication(id, dto, user, ip);
  }

  @Post("applications/:id/approve")
  @Roles(Role.ADMIN, Role.MANAGER)
  approveApplication(
    @Param("id") id: string,
    @Body() dto: ApprovePartnerApplicationDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.partners.approveApplication(id, dto, user, ip);
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

  @Post(":id/set-password")
  @Roles(Role.ADMIN)
  setPassword(
    @Param("id") id: string,
    @Body() dto: SetPartnerPasswordDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.partners.setPassword(id, dto.password, user, ip);
  }
}
