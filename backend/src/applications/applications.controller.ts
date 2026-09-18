import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { ApplicationsService } from "./applications.service";
import {
  ApplicantDto,
  CreateApplicationDto,
  ListApplicationsQuery,
  ReferenceDto,
  UpdateApplicationDto,
} from "./dto/application.dto";

@Controller("applications")
export class ApplicationsController {
  constructor(private applications: ApplicationsService) {}

  @Get()
  findAll(@Query() query: ListApplicationsQuery, @CurrentUser() user: AuthUser) {
    return this.applications.findAll(query, user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.applications.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateApplicationDto, @CurrentUser() user: AuthUser) {
    return this.applications.create(dto, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.applications.update(id, dto, user);
  }

  @Post(":id/applicants")
  addApplicant(@Param("id") id: string, @Body() dto: ApplicantDto, @CurrentUser() user: AuthUser) {
    return this.applications.addApplicant(id, dto, user);
  }

  @Patch(":id/applicants/:applicantId")
  updateApplicant(
    @Param("id") id: string,
    @Param("applicantId") applicantId: string,
    @Body() dto: ApplicantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.applications.updateApplicant(id, applicantId, dto, user);
  }

  @Delete(":id/applicants/:applicantId")
  removeApplicant(
    @Param("id") id: string,
    @Param("applicantId") applicantId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.applications.removeApplicant(id, applicantId, user);
  }

  @Post(":id/references")
  addReference(@Param("id") id: string, @Body() dto: ReferenceDto, @CurrentUser() user: AuthUser) {
    return this.applications.addReference(id, dto, user);
  }

  @Delete(":id/references/:referenceId")
  removeReference(
    @Param("id") id: string,
    @Param("referenceId") referenceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.applications.removeReference(id, referenceId, user);
  }
}
