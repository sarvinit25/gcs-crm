import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { Role } from "@prisma/client";
import { DateInput } from "../../common/date-input.decorator";

export class CreateUserDto {
  @IsString() @Length(2, 120) name: string;

  @IsEmail() email: string;

  @IsOptional() @Matches(/^[6-9]\d{9}$/, { message: "phone must be a 10-digit Indian mobile number" })
  phone?: string;

  @IsEnum(Role) role: Role;

  @IsOptional() @IsString() @Length(0, 80) designation?: string;

  @IsOptional() @DateInput() dateOfBirth?: string;
  @IsOptional() @DateInput() joinedAt?: string;
  @IsOptional() @IsString() reportsToId?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) commissionPercent?: number;

  @IsString()
  @Length(10, 128, { message: "password must be at least 10 characters" })
  password: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(/^[6-9]\d{9}$/) phone?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsString() @Length(0, 80) designation?: string;
  @IsOptional() @IsBoolean() active?: boolean;

  @IsOptional() @DateInput() dateOfBirth?: string;
  @IsOptional() @DateInput() joinedAt?: string;
  @IsOptional() @IsString() reportsToId?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) commissionPercent?: number;
}

export class ResetPasswordDto {
  @IsString() @Length(10, 128) password: string;
}
