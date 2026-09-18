import { Type } from "class-transformer";
import {
  IsBooleanString,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from "class-validator";
import { LeadStatus } from "@prisma/client";

const PHONE = /^[6-9]\d{9}$/;

/** Payload the public website forms post — deliberately minimal. */
export class PublicLeadDto {
  @IsString()
  @Length(2, 120)
  name: string;

  @Matches(PHONE, { message: "phone must be a 10-digit Indian mobile number" })
  phone: string;

  @IsOptional()
  @IsString()
  @Length(3, 160)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  city?: string;

  /** Which form it came from — "checklist-download", "partner-signup", etc. */
  @IsString()
  @Length(2, 60)
  source: string;

  /** Loan product slug as used on the website, when the form captured one. */
  @IsOptional()
  @IsString()
  @Length(2, 80)
  productSlug?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  detail?: string;

  /** Cloudflare Turnstile token from the website form. */
  @IsOptional()
  @IsString()
  @Length(0, 4096)
  captchaToken?: string;
}

export class CreateLeadDto extends PublicLeadDto {
  @IsOptional()
  @IsString()
  assignedOfficerId?: string;

  @IsOptional()
  @IsString()
  assignedManagerId?: string;

  @IsOptional()
  @IsString()
  sourcingPartnerId?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @Matches(PHONE) phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() loanProductId?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() assignedOfficerId?: string;
  @IsOptional() @IsString() assignedManagerId?: string;
  @IsOptional() @IsString() sourcingPartnerId?: string;
  @IsOptional() @IsDateString() nextFollowUpAt?: string;
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
}

export class ListLeadsQuery {
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() assignedOfficerId?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsBooleanString() dueOnly?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

export class CreateFollowUpDto {
  @IsString()
  @Length(1, 2000)
  note: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
