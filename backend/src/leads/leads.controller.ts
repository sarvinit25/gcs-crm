import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Role } from "@prisma/client";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/auth.decorators";
import { LeadsService } from "./leads.service";
import { TurnstileService } from "./turnstile.service";
import { AlertsService } from "../alerts/alerts.service";
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
    private alerts: AlertsService,
  ) {}

  // Tight cap: a genuine enquirer submits once, a script would not.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  async intake(@Body() dto: PublicLeadDto, @Ip() ip: string) {
    await this.turnstile.verify(dto.captchaToken, ip);
    const result = await this.leads.intake(dto);
    // Only a genuinely new lead rings the bell; a repeat enquiry was merged into an existing one.
    if ("isNew" in result && result.isNew) {
      void this.alerts.newLead({
        leadNo: result.leadNo,
        name: dto.name.trim(),
        phone: dto.phone,
        email: dto.email?.trim() ?? null,
        city: dto.city?.trim() ?? null,
        source: dto.source,
        loanType: dto.productSlug ?? null,
        amount: dto.amount ?? null,
        detail: dto.detail?.trim() ?? null,
      });
    }
    return { id: result.id, leadNo: result.leadNo };
  }
}

@Controller("leads")
export class LeadsController {
  constructor(private leads: LeadsService) {}

  @Get()
  findAll(@Query() query: ListLeadsQuery, @CurrentUser() user: AuthUser) {
    return this.leads.findAll(query, user);
  }

  @Get("duplicates")
  duplicates(@Query("phone") phone: string | undefined, @CurrentUser() user: AuthUser) {
    return this.leads.findDuplicates(phone ?? "", user);
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

  @Post(":id/archive")
  @Roles(Role.ADMIN, Role.MANAGER)
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.leads.setArchived(id, true, user, ip);
  }

  @Post(":id/unarchive")
  @Roles(Role.ADMIN, Role.MANAGER)
  unarchive(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.leads.setArchived(id, false, user, ip);
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
