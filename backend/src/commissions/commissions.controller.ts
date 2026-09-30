import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { CommissionsService } from "./commissions.service";
import {
  CreateCommissionDto,
  ListCommissionsQuery,
  UpdateCommissionDto,
  UpdateSplitDto,
} from "./dto/commission.dto";

@Controller("commissions")
export class CommissionsController {
  constructor(private commissions: CommissionsService) {}

  @Get()
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
