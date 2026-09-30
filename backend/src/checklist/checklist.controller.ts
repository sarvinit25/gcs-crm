import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { ChecklistApplicantType, Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { ChecklistService } from "./checklist.service";
import { CreateChecklistItemDto, UpdateChecklistItemDto } from "./dto/checklist-item.dto";

@Controller("applications/:applicationId/checklist")
export class ApplicationChecklistController {
  constructor(private checklist: ChecklistService) {}

  @Get()
  get(@Param("applicationId") applicationId: string, @CurrentUser() user: AuthUser) {
    return this.checklist.forApplication(applicationId, user);
  }
}

/** Checklist items are master data the Settings screen owns, same as loan products. */
@Controller("settings/checklist-items")
export class ChecklistItemsAdminController {
  constructor(private checklist: ChecklistService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll(
    @Query("loanProductId") loanProductId?: string,
    @Query("applicantType") applicantType?: ChecklistApplicantType,
  ) {
    return this.checklist.findAll({ loanProductId, applicantType });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Body() dto: CreateChecklistItemDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.checklist.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.checklist.update(id, dto, user, ip);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.checklist.remove(id, user, ip);
  }
}
