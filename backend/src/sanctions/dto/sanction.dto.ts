import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
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
}

export class ListSanctionsQuery {
  @IsOptional() @IsEnum(SanctionStatus) financialStatus?: SanctionStatus;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() lenderId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
