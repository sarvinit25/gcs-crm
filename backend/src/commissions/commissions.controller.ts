import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { CommissionsService } from "./commissions.service";
import {
  ClaimCommissionDto,
  CommissionExtraInputDto,
  CreateCommissionDto,
  ListCommissionsQuery,
  ReceiveCommissionDto,
  UpdateCommissionDto,
  UpdateExtraDto,
  UpdateSplitDto,
} from "./dto/commission.dto";

@Controller("commissions")
export class CommissionsController {
  constructor(private commissions: CommissionsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll(@Query() query: ListCommissionsQuery, @CurrentUser() user: AuthUser) {
    return this.commissions.findAll(query, user);
  }

  @Patch(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateCommissionDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.commissions.updateStatus(id, dto, user, ip);
  }

  @Post(":id/claim")
  @Roles(Role.ADMIN, Role.MANAGER)
  claim(
    @Param("id") id: string,
    @Body() dto: ClaimCommissionDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.commissions.claim(id, dto, user, ip);
  }

  @Post(":id/receive")
  @Roles(Role.ADMIN, Role.MANAGER)
  receive(
    @Param("id") id: string,
    @Body() dto: ReceiveCommissionDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.commissions.receive(id, dto, user, ip);
  }

  @Post(":id/extras")
  @Roles(Role.ADMIN, Role.MANAGER)
  addExtra(
    @Param("id") id: string,
    @Body() dto: CommissionExtraInputDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.commissions.addExtra(id, dto, user, ip);
  }

  @Patch(":id/extras/:extraId")
  @Roles(Role.ADMIN, Role.MANAGER)
  updateExtra(
    @Param("id") id: string,
    @Param("extraId") extraId: string,
    @Body() dto: UpdateExtraDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.commissions.updateExtra(id, extraId, dto, user, ip);
  }

  @Delete(":id/extras/:extraId")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeExtra(
    @Param("id") id: string,
    @Param("extraId") extraId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.commissions.removeExtra(id, extraId, user, ip);
  }

  @Patch(":id/splits/:splitId")
  @Roles(Role.ADMIN, Role.MANAGER)
  updateSplitStatus(
    @Param("id") id: string,
    @Param("splitId") splitId: string,
    @Body() dto: UpdateSplitDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.commissions.updateSplitStatus(id, splitId, dto, user, ip);
  }
}

@Controller("disbursements/:disbursementId/commission")
export class DisbursementCommissionController {
  constructor(private commissions: CommissionsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  get(@Param("disbursementId") disbursementId: string, @CurrentUser() user: AuthUser) {
    return this.commissions.getForDisbursement(disbursementId, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(
    @Param("disbursementId") disbursementId: string,
    @Body() dto: CreateCommissionDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.commissions.createForDisbursement(disbursementId, dto, user, ip);
  }
}
