import { Controller, Get } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }
}
