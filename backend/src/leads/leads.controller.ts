import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, Public, type AuthUser } from "../auth/auth.decorators";
import { LeadsService } from "./leads.service";
import { TurnstileService } from "./turnstile.service";
import {
  BulkLeadsDto,
  CreateFollowUpDto,
  CreateLeadDto,
  ListLeadsQuery,
  PublicLeadDto,
  UpdateLeadDto,
} from "./dto/lead.dto";

/** Open intake endpoint the public website posts to. */
@Controller("public/leads")
export class PublicLeadsController {
  constructor(
    private leads: LeadsService,
    private turnstile: TurnstileService,
  ) {}

  // Tight cap: a genuine enquirer submits once, a script would not.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async intake(@Body() dto: PublicLeadDto, @Ip() ip: string) {
    await this.turnstile.verify(dto.captchaToken, ip);
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

  @Post("bulk")
  bulk(@Body() dto: BulkLeadsDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.leads.bulkCreate(dto, user, ip);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.leads.update(id, dto, user, ip);
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
