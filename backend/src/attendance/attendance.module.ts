import { Module } from "@nestjs/common";
import { AttendanceController, PayrollController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  controllers: [AttendanceController, PayrollController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
