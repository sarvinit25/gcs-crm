import { Body, Controller, Get, Ip, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { AttendanceService } from "./attendance.service";
import {
  BulkPresentDto,
  MarkAttendanceDto,
  MonthQuery,
  PayrollStatusDto,
  UpsertPayrollDto,
} from "./dto/attendance.dto";

/** Any signed-in staff member can punch their own attendance. */
@Controller("attendance/me")
export class MyAttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Get("today")
  today(@CurrentUser() user: AuthUser) {
    return this.attendance.today(user);
  }

  @Post("check-in")
  checkIn(@CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.attendance.checkIn(user, ip);
  }

  @Post("check-out")
  checkOut(@CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.attendance.checkOut(user, ip);
  }
}

@Controller("attendance")
@Roles(Role.ADMIN, Role.MANAGER)
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Get()
  month(@Query() query: MonthQuery) {
    return this.attendance.month(query);
  }

  @Put()
  mark(@Body() dto: MarkAttendanceDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.attendance.mark(dto, user, ip);
  }

  @Post("bulk-present")
  bulkPresent(@Body() dto: BulkPresentDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.attendance.bulkPresent(dto.date, user, ip);
  }
}

@Controller("payroll")
@Roles(Role.ADMIN)
export class PayrollController {
  constructor(private attendance: AttendanceService) {}

  @Get()
  month(@Query() query: MonthQuery) {
    return this.attendance.payrollMonth(query);
  }

  @Put()
  upsert(@Body() dto: UpsertPayrollDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.attendance.upsertPayroll(dto, user, ip);
  }

  @Patch(":id/status")
  setStatus(
    @Param("id") id: string,
    @Body() dto: PayrollStatusDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.attendance.setPayrollStatus(id, dto, user, ip);
  }
}
