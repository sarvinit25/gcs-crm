import { Body, Controller, Get, Ip, Param, Put } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { EducationLoanDetailService } from "./education-loan-detail.service";
import { UpsertEducationLoanDetailDto } from "./dto/education-loan-detail.dto";

@Controller("applications/:applicationId/education-loan-detail")
export class EducationLoanDetailController {
  constructor(private detail: EducationLoanDetailService) {}

  @Get()
  get(@Param("applicationId") applicationId: string, @CurrentUser() user: AuthUser) {
    return this.detail.get(applicationId, user);
  }

  @Put()
  upsert(
    @Param("applicationId") applicationId: string,
    @Body() dto: UpsertEducationLoanDetailDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.detail.upsert(applicationId, dto, user, ip);
  }
}
