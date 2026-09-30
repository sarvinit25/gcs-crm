import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { AttendanceStatus, PayoutStatus } from "@prisma/client";
import { DateInput } from "../../common/date-input.decorator";

export class MarkAttendanceDto {
  @IsString() userId: string;

  @DateInput() date: string;

  @IsEnum(AttendanceStatus) status: AttendanceStatus;

  @IsOptional() @IsString() @Length(0, 200) note?: string;
}

export class MonthQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month: number;
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year: number;
}

export class BulkPresentDto {
  @DateInput() date: string;
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

  @IsOptional() @DateInput() paidAt?: string;
}
