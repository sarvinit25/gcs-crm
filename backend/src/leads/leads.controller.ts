import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser, Public, type AuthUser } from "../auth/auth.decorators";
import { LeadsService } from "./leads.service";
import {
  CreateFollowUpDto,
  CreateLeadDto,
  ListLeadsQuery,
  PublicLeadDto,
  UpdateLeadDto,
} from "./dto/lead.dto";

/** Open intake endpoint the public website posts to. */
@Controller("public/leads")
export class PublicLeadsController {
  constructor(private leads: LeadsService) {}

  @Public()
  @Post()
  intake(@Body() dto: PublicLeadDto) {
    return this.leads.intake(dto);
  }
}

@Controller("leads")
export class LeadsController {
  constructor(private leads: LeadsService) {}

  @Get()
  findAll(@Query() query: ListLeadsQuery, @CurrentUser() user: AuthUser) {
    return this.leads.findAll(query, user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.leads.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthUser) {
    return this.leads.create(dto, user);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthUser) {
    return this.leads.update(id, dto, user);
  }

  @Post(":id/follow-ups")
  addFollowUp(
    @Param("id") id: string,
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leads.addFollowUp(id, dto, user);
  }
}
