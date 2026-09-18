import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/auth.decorators";
import { LendersService } from "./lenders.service";
import { CreateLenderDto, UpdateLenderDto } from "./dto/lender.dto";

/** Read-only feed for the website's partner directory. */
@Controller("public/lenders")
export class PublicLendersController {
  constructor(private lenders: LendersService) {}

  @Public()
  @Get()
  findPublic() {
    return this.lenders.findPublic();
  }
}

@Controller("lenders")
export class LendersController {
  constructor(private lenders: LendersService) {}

  /** Assignment dropdowns — any signed-in staff member. */
  @Get("assignable")
  findAssignable() {
    return this.lenders.findAssignable();
  }

  @Get()
  findAll(@Query("includeInactive") includeInactive?: string) {
    return this.lenders.findAll(includeInactive === "true");
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateLenderDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.lenders.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateLenderDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.lenders.update(id, dto, user, ip);
  }
}
