import { Body, Controller, Delete, Ip, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { LenderCodesService } from "./lender-codes.service";
import { CreateLenderCodeDto, UpdateLenderCodeDto } from "./dto/lender-code.dto";

/** The broker / DSA codes GCS holds at each lender, and the payout on them. Read through `GET /lenders/:id`. */
@Controller("lender-codes")
export class LenderCodesController {
  constructor(private codes: LenderCodesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateLenderCodeDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.codes.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param("id") id: string, @Body() dto: UpdateLenderCodeDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.codes.update(id, dto, user, ip);
  }

  @Delete(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.codes.remove(id, user, ip);
  }
}
