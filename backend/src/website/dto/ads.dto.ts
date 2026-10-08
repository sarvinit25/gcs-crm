import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, IsUrl, Length, Matches } from "class-validator";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const blankToNull = ({ value }: { value: unknown }) => (typeof value === "string" && value.trim() === "" ? null : value);

export class CreateAdDto {
  @IsString() @Length(2, 80) title: string;

  /** Where a click on the poster goes. Optional; https only. */
  @IsOptional()
  @Transform(blankToNull)
  @IsUrl({ protocols: ["https"], require_protocol: true }, { message: "The link must start with https://" })
  @Length(0, 500)
  linkUrl?: string | null;

  /** First and last day it runs, as YYYY-MM-DD (India time). */
  @Matches(YMD, { message: "startsOn must be a date like 2026-10-20" }) startsOn: string;
  @Matches(YMD, { message: "endsOn must be a date like 2026-10-31" }) endsOn: string;
}

export class UpdateAdDto {
  @IsOptional() @IsString() @Length(2, 80) title?: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsUrl({ protocols: ["https"], require_protocol: true }, { message: "The link must start with https://" })
  @Length(0, 500)
  linkUrl?: string | null;

  @IsOptional() @Matches(YMD, { message: "startsOn must be a date like 2026-10-20" }) startsOn?: string;
  @IsOptional() @Matches(YMD, { message: "endsOn must be a date like 2026-10-31" }) endsOn?: string;
  @IsOptional() @IsBoolean() paused?: boolean;
}
