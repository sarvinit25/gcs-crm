import { Body, Controller, Get, Ip, Param, Put } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { PolicySheetService } from "./policy-sheet.service";

/** A lender's policy one-pager: anyone signed in can read it; an admin or manager edits it. */
@Controller("lenders/:lenderId/policy-sheet")
export class PolicySheetController {
  constructor(private sheets: PolicySheetService) {}

  @Get()
  get(@Param("lenderId") id: string) {
    return this.sheets.get(id);
  }

  @Put()
  @Roles(Role.ADMIN, Role.MANAGER)
  save(@Param("lenderId") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.sheets.save(id, body, user, ip);
  }
}
