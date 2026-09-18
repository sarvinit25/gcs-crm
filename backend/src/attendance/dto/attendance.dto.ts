import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { AttendanceStatus, PayoutStatus } from "@prisma/client";

export class MarkAttendanceDto {
  @IsString() userId: string;

  @IsDateString() date: string;

  @IsEnum(AttendanceStatus) status: AttendanceStatus;

  @IsOptional() @IsString() @Length(0, 200) note?: string;
}

export class MonthQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month: number;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year: number;
}

export class BulkPresentDto {
  @IsDateString() date: string;
}

export class UpsertPayrollDto {
  @IsString() userId: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(12) month: number;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year: number;

  @IsNumber() @Min(0) baseSalary: number;

  @IsOptional() @IsNumber() @Min(0) incentives?: number;
  @IsOptional() @IsNumber() @Min(0) deductions?: number;
}

export class PayrollStatusDto {
  @IsEnum(PayoutStatus) status: PayoutStatus;

  @IsOptional() @IsDateString() paidAt?: string;
}
