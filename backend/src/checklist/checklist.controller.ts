import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import { MarkChecklistItemDto } from "./dto/checklist-document.dto";
import { ChecklistService } from "./checklist.service";

@Controller("applications/:applicationId/checklist")
export class ApplicationChecklistController {
  constructor(private checklist: ChecklistService) {}

  @Get()
  get(@Param("applicationId") applicationId: string, @CurrentUser() user: AuthUser) {
    return this.checklist.forApplication(applicationId, user);
  }

  /** Tick or un-tick one line of the list as received. */
  @Put(":documentTypeId")
  mark(
    @Param("applicationId") applicationId: string,
    @Param("documentTypeId") documentTypeId: string,
    @Body() dto: MarkChecklistItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.checklist.setGiven(applicationId, documentTypeId, dto.given, user);
  }
}
