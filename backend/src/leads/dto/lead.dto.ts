import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBooleanString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { EmploymentType, LeadStatus } from "@prisma/client";
import { DateInput } from "../../common/date-input.decorator";

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

  /** Tracking tags from the landing-page link (?utm_source=…); the channel is worked out from these. */
  @IsOptional() @IsString() @Length(0, 120) utmSource?: string;
  @IsOptional() @IsString() @Length(0, 120) utmMedium?: string;
  @IsOptional() @IsString() @Length(0, 120) utmCampaign?: string;
  @IsOptional() @IsString() @Length(0, 120) utmContent?: string;
  @IsOptional() @IsString() @Length(0, 120) utmTerm?: string;
  /** The page the visitor landed on — the path is kept, any query string is dropped. */
  @IsOptional() @IsString() @Length(0, 300) landingPage?: string;
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
  @DateInput()
  nextFollowUpAt?: string;

  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsNumber() @Min(0) monthlyIncome?: number;
  @IsOptional() @IsString() @Length(0, 40) meetingMode?: string;
  @IsOptional() @IsString() @Length(0, 200) meetingPlace?: string;

  /** Staff can credit a lead to a channel directly (e.g. a hoarding, a society activation). */
  @IsOptional() @IsString() @Length(0, 60) channel?: string;
  @IsOptional() @IsString() @Length(0, 120) campaign?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @Matches(PHONE) phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() loanProductId?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() @Length(0, 120) lostReason?: string;
  @IsOptional() @IsString() assignedOfficerId?: string;
  @IsOptional() @IsString() assignedManagerId?: string;
  @IsOptional() @IsString() sourcingPartnerId?: string;
  @IsOptional() @DateInput() nextFollowUpAt?: string;
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsNumber() @Min(0) monthlyIncome?: number;
  @IsOptional() @IsString() @Length(0, 40) meetingMode?: string;
  @IsOptional() @IsString() @Length(0, 200) meetingPlace?: string;
  @IsOptional() @IsString() @Length(0, 60) channel?: string | null;
  @IsOptional() @IsString() @Length(0, 120) campaign?: string | null;
}

export class ListLeadsQuery {
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() assignedOfficerId?: string;
  @IsOptional() @IsString() source?: string;
  /** A marketing channel, or "none" for leads whose origin wasn't tracked. */
  @IsOptional() @IsString() channel?: string;
  @IsOptional() @IsBooleanString() dueOnly?: string;
  @IsOptional() @IsString() loanProductId?: string;
  /** "true" lists archived leads instead of the working set. */
  @IsOptional() @IsBooleanString() archived?: string;
  @IsOptional() @IsString() range?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

export class CreateFollowUpDto {
  @IsString()
  @Length(1, 2000)
  note: string;

  @IsOptional()
  @DateInput()
  dueAt?: string;
}

/** One row of a bulk import. Everything but name and phone is optional. */
export class BulkLeadRowDto {
  @IsString() @Length(1, 120) name: string;
  @IsString() phone: string;
  @IsOptional() @IsString() @Length(0, 160) email?: string;
  @IsOptional() @IsString() @Length(0, 80) city?: string;
  /** Loan product slug or display name. */
  @IsOptional() @IsString() @Length(0, 80) product?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}

export class BulkLeadsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500, { message: "Import at most 500 leads at a time" })
  @ValidateNested({ each: true })
  @Type(() => BulkLeadRowDto)
  rows: BulkLeadRowDto[];
}
