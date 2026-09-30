import { Module } from "@nestjs/common";
import { AttendanceController, MyAttendanceController, PayrollController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  controllers: [AttendanceController, MyAttendanceController, PayrollController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
