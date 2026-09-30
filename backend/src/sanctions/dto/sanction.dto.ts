import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";
import { SanctionStatus } from "@prisma/client";

export class UpsertSanctionDto {
  @IsOptional() @IsEnum(SanctionStatus) technicalStatus?: SanctionStatus;
  @IsOptional() @IsDateString() technicalAt?: string;
  @IsOptional() @IsString() @Length(0, 1000) technicalNote?: string;

  @IsOptional() @IsEnum(SanctionStatus) financialStatus?: SanctionStatus;
  @IsOptional() @IsDateString() financialAt?: string;
  @IsOptional() @IsString() @Length(0, 1000) financialNote?: string;

  @IsOptional() @IsEnum(SanctionStatus) legalStatus?: SanctionStatus;
  @IsOptional() @IsDateString() legalAt?: string;
  @IsOptional() @IsString() @Length(0, 1000) legalNote?: string;

  @IsOptional() @IsNumber() @Min(1) sanctionedAmount?: number;
  @IsOptional() @IsNumber() @Min(0) interestRate?: number;
  @IsOptional() @IsInt() @Min(1) tenureMonths?: number;
  @IsOptional() @IsString() @Length(0, 80) sanctionLetterNo?: string;
  @IsOptional() @IsDateString() validTill?: string;
}

export class ListSanctionsQuery {
  @IsOptional() @IsEnum(SanctionStatus) financialStatus?: SanctionStatus;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() lenderId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
