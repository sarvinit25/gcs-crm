import { Body, Controller, Delete, Get, Ip, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { LoanTypesService } from "./loan-types.service";
import { CreateLoanTypeDto, UpdateLoanTypeDto } from "./dto/loan-type.dto";

/** Admin screen for the loan types offered. Everyone signed in reads the active ones through /loan-products. */
@Controller("loan-types")
export class LoanTypesController {
  constructor(private types: LoanTypesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  list() {
    return this.types.list();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateLoanTypeDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.types.create(dto, user, ip);
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateLoanTypeDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.types.update(id, dto, user, ip);
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.types.remove(id, user, ip);
  }
}
