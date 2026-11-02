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
import { ExtraCommissionSource, PayoutStatus } from "@prisma/client";
import { DateInput } from "../../common/date-input.decorator";

export class CommissionSplitInputDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() sourcingPartnerId?: string;
  @IsOptional() @IsString() @Length(0, 60) stakeholderRole?: string;

  // Give either a share or a flat amount — the other is worked out.
  @IsOptional() @IsNumber() @Min(0.01) @Max(100) sharePercent?: number;
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;
}

export class CommissionExtraInputDto {
  @IsEnum(ExtraCommissionSource) source: ExtraCommissionSource;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() @Length(0, 200) note?: string;
}

export class CreateCommissionDto {
  // What the lender pays: a rate on the payout, or a flat amount. One of the two.
  @IsOptional() @IsNumber() @Min(0.01) @Max(100) grossRate?: number;
  @IsOptional() @IsNumber() @Min(0.01) grossAmount?: number;

  @IsOptional() @DateInput() receivedAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionSplitInputDto)
  splits?: CommissionSplitInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommissionExtraInputDto)
  extras?: CommissionExtraInputDto[];
}

export class ClaimCommissionDto {
  @IsOptional() @DateInput() claimedAt?: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class ReceiveCommissionDto {
  // Defaults to everything still outstanding.
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @DateInput() receivedAt?: string;
  @IsOptional() @IsString() @Length(0, 60) reference?: string;
}

export class UpdateExtraDto {
  @IsOptional() @IsEnum(PayoutStatus) status?: PayoutStatus;
  @IsOptional() @DateInput() receivedAt?: string;
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
