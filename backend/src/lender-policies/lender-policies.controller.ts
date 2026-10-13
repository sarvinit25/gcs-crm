import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { LenderPoliciesService } from "./lender-policies.service";
import {
  CreatePolicyDto,
  ExceptionDto,
  OutcomeDto,
  ReviewMatchDto,
  RunMatchDto,
  UpdatePolicyDto,
  VerifyPolicyDto,
} from "./dto/policy.dto";

/**
 * The lender-policy database and the matcher. Staff can look up policies and run a match; only
 * admins and managers change rules, confirm they are current, or approve a result for customers.
 */
@Controller("lender-policies")
export class LenderPoliciesController {
  constructor(private policies: LenderPoliciesService) {}

  @Get()
  list(@Query("lenderId") lenderId?: string, @Query("loanProductId") loanProductId?: string) {
    return this.policies.list({ lenderId, loanProductId });
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreatePolicyDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.policies.create(dto, user, ip);
  }

  // Fixed paths come before ":id", so they are not read as a policy id.
  @Post("match")
  match(@Body() dto: RunMatchDto, @CurrentUser() user: AuthUser) {
    return this.policies.runMatch(dto, user);
  }

  @Get("match/runs")
  runs(@Query("leadId") leadId?: string) {
    return this.policies.runs(leadId);
  }

  @Patch("match/runs/:id/review")
  @Roles(Role.ADMIN, Role.MANAGER)
  review(@Param("id") id: string, @Body() dto: ReviewMatchDto, @CurrentUser() user: AuthUser) {
    return this.policies.reviewRun(id, dto, user);
  }

  @Get("outcomes")
  outcomes(@Query("leadId") leadId?: string) {
    return this.policies.outcomes({ leadId });
  }

  @Get("outcomes/summary")
  outcomeSummary() {
    return this.policies.outcomeSummary();
  }

  @Post("outcomes")
  @Roles(Role.ADMIN, Role.MANAGER)
  createOutcome(@Body() dto: OutcomeDto, @CurrentUser() user: AuthUser) {
    return this.policies.createOutcome(dto, user);
  }

  @Patch("outcomes/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  updateOutcome(@Param("id") id: string, @Body() dto: OutcomeDto) {
    return this.policies.updateOutcome(id, dto);
  }

  @Patch("exceptions/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  updateException(@Param("id") id: string, @Body() dto: ExceptionDto) {
    return this.policies.updateException(id, dto);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.policies.get(id);
  }

  @Patch(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param("id") id: string, @Body() dto: UpdatePolicyDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.policies.update(id, dto, user, ip);
  }

  @Post(":id/verify")
  @Roles(Role.ADMIN, Role.MANAGER)
  verify(@Param("id") id: string, @Body() dto: VerifyPolicyDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.policies.verify(id, dto, user, ip);
  }

  @Post(":id/exceptions")
  @Roles(Role.ADMIN, Role.MANAGER)
  addException(@Param("id") id: string, @Body() dto: ExceptionDto) {
    return this.policies.addException(id, dto);
  }
}
