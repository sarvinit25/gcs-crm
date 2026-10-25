import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Put } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { CreditEvaluationService } from "./credit-evaluation.service";
import { CreditDecisionDto, ExistingLoanDto, UpdateCreditEvaluationDto, UpdateExistingLoanDto } from "./dto/credit-evaluation.dto";

/** Assessing a file before it goes to a lender. Advisors work on their own files; clearing or rejecting is for admins and managers. */
@Controller("applications/:applicationId/credit-evaluation")
export class CreditEvaluationController {
  constructor(private evaluation: CreditEvaluationService) {}

  @Get()
  get(@Param("applicationId") id: string, @CurrentUser() user: AuthUser) {
    return this.evaluation.get(id, user);
  }

  @Put()
  update(@Param("applicationId") id: string, @Body() dto: UpdateCreditEvaluationDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.evaluation.update(id, dto, user, ip);
  }

  @Post("loans")
  addLoan(@Param("applicationId") id: string, @Body() dto: ExistingLoanDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.evaluation.addLoan(id, dto, user, ip);
  }

  @Patch("loans/:loanId")
  updateLoan(@Param("applicationId") id: string, @Param("loanId") loanId: string, @Body() dto: UpdateExistingLoanDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.evaluation.updateLoan(id, loanId, dto, user, ip);
  }

  @Delete("loans/:loanId")
  removeLoan(@Param("applicationId") id: string, @Param("loanId") loanId: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.evaluation.removeLoan(id, loanId, user, ip);
  }

  @Post("decision")
  @Roles(Role.ADMIN, Role.MANAGER)
  decide(@Param("applicationId") id: string, @Body() dto: CreditDecisionDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.evaluation.decide(id, dto, user, ip);
  }
}
