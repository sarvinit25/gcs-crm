import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { normalisePhone } from "../../common/phone.util";

const blank = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() || null : value);
const phone = ({ value }: { value: unknown }) => (value === "" || value === null ? null : normalisePhone(value) ?? value);

export class CreateLenderCodeDto {
  @IsString() lenderId: string;
  /** The loan type as the lender names it, e.g. "Used Car Loan". */
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value)) @IsString() @Length(2, 120) product: string;
  @IsOptional() @IsString() loanProductId?: string;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 80) code?: string | null;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 160) registeredName?: string | null;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 300) payoutText?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) payoutPercent?: number | null;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 300) contactText?: string | null;
  @IsOptional() @Transform(phone) @Matches(/^\d{10}$/, { message: "contactPhone must be a 10-digit number" }) contactPhone?: string | null;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 400) specialCondition?: string | null;
}

export class UpdateLenderCodeDto {
  @IsOptional() @Transform(({ value }) => (typeof value === "string" ? value.trim() : value)) @IsString() @Length(2, 120) product?: string;
  @IsOptional() @Transform(blank) @IsString() loanProductId?: string | null;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 80) code?: string | null;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 160) registeredName?: string | null;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 300) payoutText?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) payoutPercent?: number | null;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 300) contactText?: string | null;
  @IsOptional() @Transform(phone) @Matches(/^\d{10}$/, { message: "contactPhone must be a 10-digit number" }) contactPhone?: string | null;
  @IsOptional() @Transform(blank) @IsString() @Length(0, 400) specialCondition?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListBranchesQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(200) limit?: number;
}
