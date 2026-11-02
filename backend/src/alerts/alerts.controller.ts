import { Controller, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { AlertsService } from "./alerts.service";

@Controller("alerts")
export class AlertsController {
  constructor(private alerts: AlertsService) {}

  /** Sends a test email to the company mailbox, to check the mail account. */
  @Post("test-email")
  @Roles(Role.ADMIN)
  testEmail(@CurrentUser() user: AuthUser) {
    return this.alerts.sendTest(user.email);
  }
}
