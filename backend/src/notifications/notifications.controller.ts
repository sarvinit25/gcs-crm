import { Controller, Get } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user);
  }
}
