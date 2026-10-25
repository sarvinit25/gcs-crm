import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

const list = () => [IsOptional(), IsArray(), ArrayMaxSize(200), IsString({ each: true }), Length(1, 80, { each: true })];
const apply = (decorators: PropertyDecorator[]) => (target: object, key: string) => decorators.forEach((d) => d(target, key));

/** Everything a policy record holds. Empty means "not recorded" (never "no limit"). */
export class PolicyFieldsDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsString() @Length(0, 300) source?: string | null;
  @IsOptional() @IsInt() @Min(7) @Max(730) reviewEveryDays?: number;

  @IsOptional() @IsNumber() @Min(0) minAmount?: number | null;
  @IsOptional() @IsNumber() @Min(0) maxAmount?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) minRate?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) maxRate?: number | null;
  @IsOptional() @IsString() @Length(0, 200) processingFee?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) minTenureMonths?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) maxTenureMonths?: number | null;
  @IsOptional() @IsIn(["FLOATING", "FIXED"]) rateType?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionPercent?: number | null;
  @IsOptional() @IsString() @Length(0, 200) specialScheme?: string | null;

  @apply(list()) employmentTypes?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(100) minAge?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) maxAgeAtApplication?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) maxAgeAtMaturity?: number | null;
  @IsOptional() @IsNumber() @Min(0) minMonthlyIncome?: number | null;
  @IsOptional() @IsInt() @Min(0) minBusinessVintageMonths?: number | null;
  @IsOptional() @IsNumber() @Min(0) minAnnualTurnover?: number | null;
  @IsOptional() @IsNumber() @Min(0) minAnnualProfit?: number | null;
  @IsOptional() @IsInt() @Min(300) @Max(900) minCreditScore?: number | null;
  @apply(list()) acceptedConstitutions?: string[];
  @IsOptional() @IsBoolean() gstRequired?: boolean;

  @IsOptional() @IsArray() foirBands?: unknown[] | null;
  @IsOptional() @IsArray() ltvBands?: unknown[] | null;
  @apply(list()) acceptedPropertyTypes?: string[];

  @IsOptional() @IsBoolean() allIndia?: boolean;
  @apply(list()) cities?: string[];
  @IsOptional() @IsString() @Length(0, 1000) notes?: string | null;
}

export class CreatePolicyDto extends PolicyFieldsDto {
  @IsString() lenderId: string;
  @IsString() loanProductId: string;
}

/** One loan type's terms, added to several lenders at once. Lenders that already have it are left alone. */
export class BulkPolicyDto extends PolicyFieldsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) lenderIds: string[];
  @IsString() loanProductId: string;
  /** A single FOIR ceiling, stored as one band. */
  @IsOptional() @IsNumber() @Min(1) @Max(100) maxFoirPercent?: number;
}

export class UpdatePolicyDto extends PolicyFieldsDto {
  /** Why the rules changed; kept in the policy's history. */
  @IsOptional() @IsString() @Length(0, 300) reason?: string;
}

export class VerifyPolicyDto {
  @IsOptional() @IsString() @Length(0, 300) source?: string;
  @IsOptional() @IsString() @Length(0, 300) reason?: string;
}

export class ExceptionDto {
  @IsOptional() @IsString() @Length(2, 300) scenario?: string;
  @IsOptional() @IsString() @Length(0, 500) normalRule?: string | null;
  @IsOptional() @IsString() @Length(0, 500) possibleException?: string | null;
  @IsOptional() @IsString() @Length(0, 300) requiredApproval?: string | null;
  @IsOptional() @IsString() @Length(0, 300) source?: string | null;
  @IsOptional() @IsString() @Length(0, 500) expertNote?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() verifiedNow?: boolean;
}

export class MatchProfileDto {
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() @Length(0, 80) city?: string;
  @IsOptional() @IsIn(["SALARIED", "SELF_EMPLOYED"]) employmentType?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) age?: number;
  @IsOptional() @IsNumber() @Min(0) monthlyIncome?: number;
  @IsOptional() @IsNumber() @Min(0) existingEmi?: number;
  @IsOptional() @IsInt() @Min(300) @Max(900) creditScore?: number;
  @IsOptional() @IsNumber() @Min(0) propertyValue?: number;
  @IsOptional() @IsString() @Length(0, 80) propertyType?: string;
  @IsOptional() @IsString() @Length(0, 80) constitution?: string;
  @IsOptional() @IsInt() @Min(0) businessVintageMonths?: number;
  @IsOptional() @IsNumber() @Min(0) annualTurnover?: number;
  @IsOptional() @IsNumber() @Min(0) annualProfit?: number;
  @IsOptional() @IsBoolean() gstRegistered?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(600) tenureMonths?: number;
}

export class RunMatchDto {
  @IsString() loanProductId: string;
  @IsOptional() @IsString() leadId?: string;
  @IsObject() @ValidateNested() @Type(() => MatchProfileDto) profile: MatchProfileDto;
}

export class ReviewMatchDto {
  @IsIn(["APPROVED", "REJECTED"]) status: string;
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class OutcomeDto {
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() applicationId?: string;
  @IsOptional() @IsString() lenderId?: string;
  @IsOptional() @IsString() loanProductId?: string;
  @IsOptional() @IsBoolean() recommended?: boolean;
  @IsOptional() @IsDateString() submittedAt?: string | null;
  @IsOptional() @IsIn(["SUBMITTED", "QUERY", "SANCTIONED", "REJECTED", "WITHDRAWN", "DISBURSED"]) outcome?: string;
  @IsOptional() @IsNumber() @Min(0) sanctionAmount?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) rate?: number | null;
  @IsOptional() @IsInt() @Min(0) turnaroundDays?: number | null;
  @IsOptional() @IsString() @Length(0, 300) rejectionReason?: string | null;
  @IsOptional() @IsBoolean() disbursed?: boolean;
  @IsOptional() @IsString() @Length(0, 500) notes?: string | null;
}
