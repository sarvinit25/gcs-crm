import { Body, Controller, Get, Ip, Param, Put, Query } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { SanctionsService } from "./sanctions.service";
import { ListSanctionsQuery, UpsertSanctionDto } from "./dto/sanction.dto";

@Controller("sanctions")
export class SanctionsController {
  constructor(private sanctions: SanctionsService) {}

  @Get()
  findAll(@Query() query: ListSanctionsQuery, @CurrentUser() user: AuthUser) {
    return this.sanctions.findAll(query, user);
  }
}

@Controller("applications/:applicationId/sanction")
export class ApplicationSanctionController {
  constructor(private sanctions: SanctionsService) {}

  @Get()
  find(@Param("applicationId") applicationId: string, @CurrentUser() user: AuthUser) {
    return this.sanctions.findByApplication(applicationId, user);
  }

  @Put()
  upsert(
    @Param("applicationId") applicationId: string,
    @Body() dto: UpsertSanctionDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.sanctions.upsert(applicationId, dto, user, ip);
  }
}
