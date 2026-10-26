import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBooleanString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { DocumentsStatus, EmploymentType, LeadSegment, LeadStatus } from "@prisma/client";
import { DateInput } from "../../common/date-input.decorator";
import { normalisePhone } from "../../common/phone.util";

const PHONE = /^[6-9]\d{9}$/;

/** Payload the public website forms post — deliberately minimal. */
export class PublicLeadDto {
  @IsString()
  @Length(2, 120)
  name: string;

  // Forms send it as typed ("+91 98765 43210"); it is stored, and matched against other leads, as 10 digits.
  @Transform(({ value }) => normalisePhone(value) ?? value)
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
  @IsOptional() @IsEnum(DocumentsStatus) documentsStatus?: DocumentsStatus;

  /** Staff can credit a lead to a channel directly (e.g. a hoarding, a society activation). */
  @IsOptional() @IsString() @Length(0, 60) channel?: string;
  @IsOptional() @IsString() @Length(0, 120) campaign?: string;
}

/** The optional second form on a loan page: more answers for the lead the visitor just created. */
export class LeadFollowUpDto {
  @IsString() @Length(10, 400) token: string;
  @IsString() @Length(2, 2000) detail: string;
  @IsOptional() @IsIn(["SALARIED", "SELF_EMPLOYED"]) employmentType?: "SALARIED" | "SELF_EMPLOYED";
  @IsOptional() @IsNumber() @Min(0) monthlyIncome?: number;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @Matches(PHONE) phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() loanProductId?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number | null;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() @Length(0, 120) lostReason?: string;
  @IsOptional() @IsString() assignedOfficerId?: string;
  @IsOptional() @IsString() assignedManagerId?: string;
  @IsOptional() @IsString() sourcingPartnerId?: string;
  @IsOptional() @DateInput() nextFollowUpAt?: string;
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType | null;
  @IsOptional() @IsNumber() @Min(0) monthlyIncome?: number | null;

  /** A second number to reach them on. A blank clears it. */
  @IsOptional() @Matches(PHONE) secondaryPhone?: string | null;
  @IsOptional() @DateInput() dateOfBirth?: string | null;
  @IsOptional() @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value)) @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: "pan must look like ABCDE1234F" }) pan?: string | null;
  @IsOptional() @IsString() @Length(0, 300) address?: string | null;
  @IsOptional() @Matches(/^\d{6}$/, { message: "pincode must be 6 digits" }) pincode?: string | null;
  @IsOptional() @IsString() @Length(0, 160) employerName?: string | null;
  @IsOptional() @IsString() @Length(0, 120) designation?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(60) experienceYears?: number | null;
  @IsOptional() @IsString() @Length(0, 120) workLocation?: string | null;
  @IsOptional() @IsEmail() officialEmail?: string | null;

  @IsOptional() @IsString() @Length(0, 40) meetingMode?: string;
  @IsOptional() @IsString() @Length(0, 200) meetingPlace?: string;
  @IsOptional() @IsString() @Length(0, 60) channel?: string | null;
  @IsOptional() @IsString() @Length(0, 120) campaign?: string | null;
  @IsOptional() @IsEnum(DocumentsStatus) documentsStatus?: DocumentsStatus;
  /** A segment to pin the lead to, or "AUTO" to hand it back to the automatic rules. */
  @IsOptional() @IsIn([...Object.values(LeadSegment), "AUTO"]) segment?: LeadSegment | "AUTO";
}

export class ListLeadsQuery {
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsEnum(LeadSegment) segment?: LeadSegment;
  @IsOptional() @IsString() search?: string;
  /** A staff member's id, or "none" for leads nobody owns yet. */
  @IsOptional() @IsString() assignedOfficerId?: string;
  /** A sourcing partner's id, or "none" for leads we got ourselves. */
  @IsOptional() @IsString() sourcingPartnerId?: string;
  @IsOptional() @IsString() source?: string;
  /** "true" lists only the people who signed in to the website chat with a mobile code. */
  @IsOptional() @IsBooleanString() chatbot?: string;
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
  /** The lead source (channel) it came from. */
  @IsOptional() @IsString() @Length(0, 60) channel?: string;
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
