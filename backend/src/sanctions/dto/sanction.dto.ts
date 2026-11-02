import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { SanctionStatus } from "@prisma/client";
import { DateInput } from "../../common/date-input.decorator";

export class UpsertSanctionDto {
  @IsOptional() @IsEnum(SanctionStatus) technicalStatus?: SanctionStatus;
  @IsOptional() @DateInput() technicalAt?: string;
  @IsOptional() @IsString() @Length(0, 1000) technicalNote?: string;

  @IsOptional() @IsEnum(SanctionStatus) financialStatus?: SanctionStatus;
  @IsOptional() @DateInput() financialAt?: string;
  @IsOptional() @IsString() @Length(0, 1000) financialNote?: string;

  @IsOptional() @IsEnum(SanctionStatus) legalStatus?: SanctionStatus;
  @IsOptional() @DateInput() legalAt?: string;
  @IsOptional() @IsString() @Length(0, 1000) legalNote?: string;

  @IsOptional() @IsNumber() @Min(1) sanctionedAmount?: number;
  @IsOptional() @IsNumber() @Min(0) interestRate?: number;
  @IsOptional() @IsInt() @Min(1) tenureMonths?: number;
  @IsOptional() @IsString() @Length(0, 80) sanctionLetterNo?: string;
  @IsOptional() @DateInput() validTill?: string;

  @IsOptional() @DateInput() sanctionDate?: string;
  @IsOptional() @IsString() @Length(0, 120) bankRm?: string;
  // Left blank, the EMI is worked out from amount, rate and tenure.
  @IsOptional() @IsNumber() @Min(0) emiAmount?: number;
  @IsOptional() @DateInput() firstEmiDate?: string;
  // Either a percentage of the sanctioned amount or a flat sum.
  @IsOptional() @IsNumber() @Min(0) @Max(100) processingFeePercent?: number;
  @IsOptional() @IsNumber() @Min(0) processingFee?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionPercent?: number;
  @IsOptional() @IsString() @Length(0, 1000) notes?: string;
}

export class ListSanctionsQuery {
  @IsOptional() @IsEnum(SanctionStatus) financialStatus?: SanctionStatus;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() lenderId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
