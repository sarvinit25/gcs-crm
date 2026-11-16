import { Controller, Get } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../auth/auth.decorators";
import { ApiUsageService } from "./api-usage.service";

@Controller("api-usage")
@Roles(Role.ADMIN)
export class ApiUsageController {
  constructor(private usage: ApiUsageService) {}

  @Get()
  summary() {
    return this.usage.summary();
  }
}
