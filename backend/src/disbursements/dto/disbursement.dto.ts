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
import { DisbursementType } from "@prisma/client";

export class CreateDisbursementDto {
  @IsOptional() @IsEnum(DisbursementType) type?: DisbursementType;

  @IsNumber() @Min(1) amount: number;

  @IsDateString() disbursedAt: string;

  @IsOptional() @IsNumber() @Min(0) interestRate?: number;
  @IsOptional() @IsString() @Length(0, 40) utrNo?: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class ListDisbursementsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() lenderId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
