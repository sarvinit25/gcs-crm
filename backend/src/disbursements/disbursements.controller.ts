import { Body, Controller, Delete, Get, Ip, Param, Post, Query } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { DisbursementsService } from "./disbursements.service";
import { CreateDisbursementDto, ListDisbursementsQuery } from "./dto/disbursement.dto";

@Controller("disbursements")
export class DisbursementsController {
  constructor(private disbursements: DisbursementsService) {}

  @Get()
  findAll(@Query() query: ListDisbursementsQuery, @CurrentUser() user: AuthUser) {
    return this.disbursements.findAll(query, user);
  }
}

@Controller("applications/:applicationId/disbursements")
export class ApplicationDisbursementsController {
  constructor(private disbursements: DisbursementsService) {}

  @Get()
  list(@Param("applicationId") applicationId: string, @CurrentUser() user: AuthUser) {
    return this.disbursements.listForApplication(applicationId, user);
  }

  @Post()
  create(
    @Param("applicationId") applicationId: string,
    @Body() dto: CreateDisbursementDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.disbursements.create(applicationId, dto, user, ip);
  }

  @Delete(":id")
  remove(
    @Param("applicationId") applicationId: string,
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.disbursements.remove(applicationId, id, user, ip);
  }
}
