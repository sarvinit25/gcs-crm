import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { periodOptions } from "../common/date.util";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query("range") range?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.dashboard.summary(user, { range, from, to });
  }

  /** The period picker's options; financial-year names move with the calendar. */
  @Get("periods")
  periods() {
    return periodOptions();
  }
}
