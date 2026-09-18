import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

export class CreatePartnerDto {
  @IsString() @Length(2, 120) name: string;

  @IsOptional() @IsString() @Length(0, 160) firm?: string;

  @Matches(/^[6-9]\d{9}$/, { message: "phone must be a 10-digit Indian mobile number" })
  phone: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 80) city?: string;

  /** Percentage of GCS's commission this partner takes on a referred case. */
  @IsNumber() @Min(0) @Max(100) commissionRate: number;

  /** Optional: sets the partner up with portal access immediately. */
  @IsOptional() @IsString() @Length(1, 128) password?: string;
}

export class SetPartnerPasswordDto {
  @IsString() @Length(1, 128) password: string;
}

export class UpdatePartnerDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(0, 160) firm?: string;
  @IsOptional() @Matches(/^[6-9]\d{9}$/) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 80) city?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionRate?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
