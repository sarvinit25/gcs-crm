import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { LenderType } from "@prisma/client";

export class CreateLenderDto {
  @IsString() @Length(2, 120) name: string;

  @IsEnum(LenderType) type: LenderType;

  /** Path under the website's /public, e.g. /banks/hdfc-bank.svg. */
  @IsOptional() @IsString() @Length(0, 300) logoUrl?: string;

  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateLenderDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsEnum(LenderType) type?: LenderType;
  @IsOptional() @IsString() @Length(0, 300) logoUrl?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
