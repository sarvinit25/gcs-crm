import { Transform, Type } from "class-transformer";
import { Equals, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { DateInput } from "../../common/date-input.decorator";
import { CONSENT_METHODS, MAX_SCORE, MIN_SCORE } from "../credit-bands";

export class RunCheckDto {
  /** The staff member confirms the person has agreed to the check. */
  @IsBoolean() @Equals(true, { message: "Consent from the applicant is required before a credit check" }) consent: boolean;
  @IsIn(CONSENT_METHODS as unknown as string[], { message: "Say how the applicant gave consent" }) consentMethod: string;
  /** Super Admin only: run again inside the usual waiting period. */
  @IsOptional() @IsBoolean() force?: boolean;
}

export class RecordScoreDto {
  @IsInt() @Min(MIN_SCORE) @Max(MAX_SCORE) score: number;
  /** The date on the report the score came from. */
  @DateInput() reportDate: string;
  @IsOptional() @Transform(({ value }) => (typeof value === "string" ? value.trim() : value)) @IsString() @Length(0, 80) reference?: string;
  @IsOptional() @IsString() @Length(0, 300) note?: string;
}

export class ListCreditQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(["excellent", "good", "fair", "low"]) band?: string;
  /** "none" = no score yet; "stale" = has a score older than the re-check period. */
  @IsOptional() @IsIn(["none", "stale"]) show?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
