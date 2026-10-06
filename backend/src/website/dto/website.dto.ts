import { Type } from "class-transformer";
import { IsBooleanString, IsEnum, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { SubmissionOutcome } from "@prisma/client";

export class ListSubmissionsQuery {
  @IsOptional() @IsString() @Length(0, 120) search?: string;
  /** Which form it came from, as stored ("ca-legal-enquiry" …). */
  @IsOptional() @IsString() @Length(0, 60) form?: string;
  @IsOptional() @IsEnum(SubmissionOutcome) outcome?: SubmissionOutcome;
  /** Only the entries that were merged into this lead. */
  @IsOptional() @IsString() @Length(0, 40) leadId?: string;
  /** "true" lists only entries that share a phone number with a different name. */
  @IsOptional() @IsBooleanString() sharedPhone?: string;
  @IsOptional() @IsString() range?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
