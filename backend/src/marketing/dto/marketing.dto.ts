import { IsIn, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { DateInput } from "../../common/date-input.decorator";

export const GROUPINGS = ["channel", "campaign", "landing", "month"] as const;
export type Grouping = (typeof GROUPINGS)[number];

export class PerformanceQuery {
  @IsOptional() @IsIn(GROUPINGS) by?: Grouping;
  @IsOptional() @IsString() range?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class CreateSpendDto {
  @DateInput() spentOn: string;
  @IsString() @Length(2, 60) channel: string;
  @IsOptional() @IsString() @Length(0, 120) campaign?: string;
  @IsOptional() @IsString() @Length(0, 120) vendor?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1e11) amount: number;
  @IsOptional() @IsString() @Length(0, 300) note?: string;
}

export class UpdateSpendDto {
  @IsOptional() @DateInput() spentOn?: string;
  @IsOptional() @IsString() @Length(2, 60) channel?: string;
  @IsOptional() @IsString() @Length(0, 120) campaign?: string | null;
  @IsOptional() @IsString() @Length(0, 120) vendor?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1e11) amount?: number;
  @IsOptional() @IsString() @Length(0, 300) note?: string | null;
}

export class ListSpendQuery {
  @IsOptional() @IsString() range?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() channel?: string;
}
