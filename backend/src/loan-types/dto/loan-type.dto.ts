import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

const COLOR = /^#[0-9a-fA-F]{6}$/;
const CODE = /^[A-Za-z0-9_-]{1,30}$/;
const SLUG = /^[a-z0-9-]+$/;
const MAX_AMOUNT = 100_000_000_000;

export class CreateLoanTypeDto {
  @IsString() @Length(2, 120) name: string;
  @IsString() @Length(2, 120) @Matches(SLUG, { message: "slug: lowercase letters, numbers and hyphens only" }) slug: string;
  @IsOptional() @IsString() @Matches(CODE, { message: "code: letters, numbers, - or _ only, up to 30" }) code?: string;
  @IsOptional() @IsString() @Length(0, 80) category?: string;
  @IsOptional() @IsString() @Length(0, 200) description?: string;
  @IsOptional() @IsString() @Length(0, 40) icon?: string;
  @IsOptional() @IsString() @Matches(COLOR, { message: "color must look like #845adf" }) color?: string;
  @IsOptional() @IsBoolean() secured?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_AMOUNT) minAmount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_AMOUNT) maxAmount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateLoanTypeDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(2, 120) @Matches(SLUG, { message: "slug: lowercase letters, numbers and hyphens only" }) slug?: string;
  @IsOptional() @IsString() @Matches(CODE, { message: "code: letters, numbers, - or _ only, up to 30" }) code?: string | null;
  @IsOptional() @IsString() @Length(0, 80) category?: string | null;
  @IsOptional() @IsString() @Length(0, 200) description?: string | null;
  @IsOptional() @IsString() @Length(0, 40) icon?: string | null;
  @IsOptional() @IsString() @Matches(COLOR, { message: "color must look like #845adf" }) color?: string;
  @IsOptional() @IsBoolean() secured?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_AMOUNT) minAmount?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_AMOUNT) maxAmount?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
