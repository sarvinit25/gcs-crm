import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from "class-validator";
import { Role } from "@prisma/client";

export class CreateUserDto {
  @IsString() @Length(2, 120) name: string;

  @IsEmail() email: string;

  @IsOptional() @Matches(/^[6-9]\d{9}$/, { message: "phone must be a 10-digit Indian mobile number" })
  phone?: string;

  @IsEnum(Role) role: Role;

  @IsOptional() @IsString() @Length(0, 80) designation?: string;

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
}

export class ResetPasswordDto {
  @IsString() @Length(10, 128) password: string;
}
