import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { Role } from "@prisma/client";
import type { Response } from "express";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { toCsv } from "../common/csv.util";
import { istToday } from "../common/date.util";
import { MarketingService } from "./marketing.service";
import { CreateSpendDto, ListSpendQuery, PerformanceQuery, UpdateSpendDto } from "./dto/marketing.dto";

@Controller("marketing")
export class MarketingController {
  constructor(private marketing: MarketingService) {}

  /** The channel list for lead forms — every signed-in person needs it. */
  @Get("channels")
  channels() {
    return this.marketing.channels();
  }

  @Get("performance")
  @Roles(Role.ADMIN, Role.MANAGER)
  performance(@Query() q: PerformanceQuery) {
    return this.marketing.performance(q);
  }

  @Get("performance/export")
  @Roles(Role.ADMIN, Role.MANAGER)
  async export(@Query() q: PerformanceQuery, @Res() res: Response) {
    const csv = toCsv(await this.marketing.exportRows(q));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gcs-marketing-${q.by ?? "channel"}-${istToday()}.csv"`);
    res.send(`﻿${csv}`);
  }

  @Get("spend")
  @Roles(Role.ADMIN, Role.MANAGER)
  listSpend(@Query() q: ListSpendQuery) {
    return this.marketing.listSpend(q);
  }

  @Post("spend")
  @Roles(Role.ADMIN, Role.MANAGER)
  createSpend(@Body() dto: CreateSpendDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.marketing.createSpend(dto, user, ip);
  }

  @Patch("spend/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  updateSpend(@Param("id") id: string, @Body() dto: UpdateSpendDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.marketing.updateSpend(id, dto, user, ip);
  }

  @Delete("spend/:id")
  @Roles(Role.ADMIN, Role.MANAGER)
  removeSpend(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.marketing.removeSpend(id, user, ip);
  }
}
