import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { PayoutStatus } from "@prisma/client";
import { DateInput } from "../../common/date-input.decorator";

export class CommissionSplitInputDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() sourcingPartnerId?: string;
  @IsOptional() @IsString() @Length(0, 60) stakeholderRole?: string;

  @IsNumber() @Min(0.01) @Max(100) sharePercent: number;
}

export class CreateCommissionDto {
  @IsNumber() @Min(0.01) @Max(100) grossRate: number;

  @IsOptional() @DateInput() receivedAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionSplitInputDto)
  splits?: CommissionSplitInputDto[];
}

export class UpdateCommissionDto {
  @IsOptional() @IsEnum(PayoutStatus) status?: PayoutStatus;
  @IsOptional() @DateInput() receivedAt?: string;
}

export class UpdateSplitDto {
  @IsOptional() @IsEnum(PayoutStatus) status?: PayoutStatus;
  @IsOptional() @DateInput() paidAt?: string;
  @IsOptional() @IsString() @Length(0, 60) stakeholderRole?: string;
}

export class ListCommissionsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(PayoutStatus) status?: PayoutStatus;
  @IsOptional() @IsString() lenderId?: string;
  @IsOptional() @IsString() range?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
