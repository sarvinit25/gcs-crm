import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { LenderContactKind } from "@prisma/client";
import { normalisePhone } from "../../common/phone.util";

const lower = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() || undefined : value);
const blankToNull = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() || null : value);
const trimmed = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class CreateLenderContactDto {
  @IsString() lenderId: string;
  @Transform(trimmed) @IsString() @Length(2, 120) name: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(0, 80) designation?: string;
  @IsOptional() @Transform(({ value }) => normalisePhone(value)) @Matches(/^\d{10}$/, { message: "phone must be a 10-digit number" }) phone?: string;
  @IsOptional() @Transform(lower) @IsEmail() @Length(3, 160) email?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @Length(1, 40, { each: true }) segments?: string[];
  @IsOptional() @IsString() @Length(0, 500) notes?: string;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 80) city?: string | null;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 80) state?: string | null;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 200) region?: string | null;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 120) branch?: string | null;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 40) employeeCode?: string | null;
  @IsOptional() @IsEnum(LenderContactKind) kind?: LenderContactKind;
}

export class UpdateLenderContactDto {
  @IsOptional() @Transform(trimmed) @IsString() @Length(2, 120) name?: string;
  @IsOptional() @Transform(trimmed) @IsString() @Length(0, 80) designation?: string | null;
  @IsOptional() @Transform(({ value }) => (value === "" ? null : normalisePhone(value))) @Matches(/^\d{10}$/, { message: "phone must be a 10-digit number" }) phone?: string | null;
  @IsOptional() @Transform(({ value }) => (value === "" ? null : lower({ value }))) @IsEmail() @Length(3, 160) email?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @Length(1, 40, { each: true }) segments?: string[];
  @IsOptional() @IsString() @Length(0, 500) notes?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 80) city?: string | null;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 80) state?: string | null;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 200) region?: string | null;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 120) branch?: string | null;
  @IsOptional() @Transform(blankToNull) @IsString() @Length(0, 40) employeeCode?: string | null;
  @IsOptional() @IsEnum(LenderContactKind) kind?: LenderContactKind;
}

export class ListLenderContactsQuery {
  @IsOptional() @IsString() lenderId?: string;
  @IsOptional() @IsString() segment?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() includeInactive?: string;
  /** RELATIONSHIP (people who take our files) or DIRECTORY (regional / branch / escalation names). */
  @IsOptional() @IsEnum(LenderContactKind) kind?: LenderContactKind;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(200) limit?: number;
}
