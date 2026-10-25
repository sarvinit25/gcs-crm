import { Controller, Get, Param } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { ChecklistService } from "./checklist.service";

@Controller("applications/:applicationId/checklist")
export class ApplicationChecklistController {
  constructor(private checklist: ChecklistService) {}

  @Get()
  get(@Param("applicationId") applicationId: string, @CurrentUser() user: AuthUser) {
    return this.checklist.forApplication(applicationId, user);
  }
}
