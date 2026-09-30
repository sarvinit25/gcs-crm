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
import { DisbursementType, RoiType } from "@prisma/client";
import { DateInput } from "../../common/date-input.decorator";

export class CreateDisbursementDto {
  @IsOptional() @IsEnum(DisbursementType) type?: DisbursementType;

  @IsNumber() @Min(1) amount: number;

  @DateInput() disbursedAt: string;

  @IsOptional() @IsNumber() @Min(0) interestRate?: number;
  @IsOptional() @IsEnum(RoiType) roiType?: RoiType;
  @IsOptional() @IsString() @Length(0, 60) loanAccountNo?: string;
  @IsOptional() @IsString() @Length(0, 40) utrNo?: string;

  @IsOptional() @IsNumber() @Min(0) processingFee?: number;
  @IsOptional() @IsNumber() @Min(0) insuranceAmount?: number;
  @IsOptional() @IsNumber() @Min(0) documentationCharges?: number;
  @IsOptional() @IsNumber() @Min(0) stampDuty?: number;

  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class ListDisbursementsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() lenderId?: string;
  @IsOptional() @IsString() range?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
