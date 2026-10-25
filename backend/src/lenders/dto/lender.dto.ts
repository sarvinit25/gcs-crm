import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { LenderType } from "@prisma/client";

const PORTAL_URL = /^https?:\/\/\S+$/i;
const URL_MESSAGE = "portalUrl must start with http:// or https://";

export class CreateLenderDto {
  @IsString() @Length(2, 120) name: string;

  @IsEnum(LenderType) type: LenderType;

  /** Path under the website's /public, e.g. /banks/hdfc-bank.svg. */
  @IsOptional() @IsString() @Length(0, 300) logoUrl?: string;

  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;

  @IsOptional() @IsString() @Length(0, 40) shortName?: string;
  @IsOptional() @IsString() @Length(0, 60) brokerCode?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) defaultCommission?: number;
  @IsOptional() @IsString() @Length(0, 300) @Matches(PORTAL_URL, { message: URL_MESSAGE }) portalUrl?: string;
  @IsOptional() @IsString() @Length(0, 120) branchName?: string;
  @IsOptional() @IsString() @Length(0, 80) branchCity?: string;
  @IsOptional() @IsString() @Length(0, 300) branchAddress?: string;
  @IsOptional() @IsString() @Length(0, 1000) notes?: string;
}

export class UpdateLenderDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsEnum(LenderType) type?: LenderType;
  @IsOptional() @IsString() @Length(0, 300) logoUrl?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsString() @Length(0, 40) shortName?: string | null;
  @IsOptional() @IsString() @Length(0, 60) brokerCode?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) defaultCommission?: number | null;
  @IsOptional() @IsString() @Length(0, 300) @Matches(PORTAL_URL, { message: URL_MESSAGE }) portalUrl?: string | null;
  @IsOptional() @IsString() @Length(0, 120) branchName?: string | null;
  @IsOptional() @IsString() @Length(0, 80) branchCity?: string | null;
  @IsOptional() @IsString() @Length(0, 300) branchAddress?: string | null;
  @IsOptional() @IsString() @Length(0, 1000) notes?: string | null;
}
