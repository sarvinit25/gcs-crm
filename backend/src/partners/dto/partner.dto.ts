import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

const upper = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toUpperCase() : value);
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Address, tax and bank details of a partner. Blank means "not recorded"; the form sends null to clear one. */
class PartnerDetailsDto {
  @IsOptional() @IsString() @Length(0, 300) address?: string | null;
  @IsOptional() @IsString() @Length(0, 80) state?: string | null;
  @IsOptional() @Matches(/^\d{6}$/, { message: "pincode must be 6 digits" }) pincode?: string | null;
  @IsOptional() @Transform(upper) @Matches(PAN, { message: "pan must look like ABCDE1234F" }) pan?: string | null;
  @IsOptional() @Transform(upper) @Matches(GSTIN, { message: "gstin must be a valid 15-character GST number" }) gstin?: string | null;
  @IsOptional() @IsString() @Length(0, 120) bankName?: string | null;
  @IsOptional() @Matches(/^\d{6,18}$/, { message: "account number must be 6 to 18 digits" }) accountNumber?: string | null;
  @IsOptional() @Transform(upper) @Matches(IFSC, { message: "ifsc must look like HDFC0001234" }) ifsc?: string | null;
  @IsOptional() @IsString() @Length(0, 120) accountHolder?: string | null;
  @IsOptional() @IsString() @Length(0, 1000) notes?: string | null;
}

export class CreatePartnerDto extends PartnerDetailsDto {
  @IsString() @Length(2, 120) name: string;

  @IsOptional() @IsString() @Length(0, 160) firm?: string;

  @Matches(/^[6-9]\d{9}$/, { message: "phone must be a 10-digit Indian mobile number" })
  phone: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 80) city?: string;

  /** Percentage of GCS's commission this partner takes on a referred case. */
  @IsNumber() @Min(0) @Max(100) commissionRate: number;

  @IsOptional() @IsString() managerId?: string;

  /** Optional: sets the partner up with portal access immediately. */
  @IsOptional() @IsString() @Length(1, 128) password?: string;
}

export class SetPartnerPasswordDto {
  @IsString() @Length(1, 128) password: string;
}

export class UpdatePartnerDto extends PartnerDetailsDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(0, 160) firm?: string;
  @IsOptional() @Matches(/^[6-9]\d{9}$/) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 80) city?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionRate?: number;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
