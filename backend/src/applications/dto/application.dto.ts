import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from "class-validator";
import { ApplicantConstitution, ApplicationStatus, EmploymentType } from "@prisma/client";

const PHONE = /^[6-9]\d{9}$/;

export class ApplicantDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;

  @IsString() @Length(2, 120) name: string;

  @IsOptional() @IsString() @Length(1, 60) relation?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @Matches(PHONE) phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: "pan must look like ABCDE1234F" })
  pan?: string;
  @IsOptional() @Matches(/^\d{4}$/) aadhaarLast4?: string;
  @IsOptional() @IsString() @Length(0, 300) address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @Matches(/^\d{6}$/) pincode?: string;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsEnum(ApplicantConstitution) constitution?: ApplicantConstitution;
  @IsOptional() @IsBoolean() isNRI?: boolean;
  @IsOptional() @IsString() employerName?: string;
  @IsOptional() @IsNumber() @Min(0) monthlyIncome?: number;
  @IsOptional() @IsInt() @Min(300) cibilScore?: number;
}

/** Same shape as ApplicantDto, but every field is optional — for PATCHing one applicant. */
export class UpdateApplicantDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;

  @IsOptional() @IsString() @Length(1, 60) relation?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @Matches(PHONE) phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: "pan must look like ABCDE1234F" })
  pan?: string;
  @IsOptional() @Matches(/^\d{4}$/) aadhaarLast4?: string;
  @IsOptional() @IsString() @Length(0, 300) address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @Matches(/^\d{6}$/) pincode?: string;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsEnum(ApplicantConstitution) constitution?: ApplicantConstitution;
  @IsOptional() @IsBoolean() isNRI?: boolean;
  @IsOptional() @IsString() employerName?: string;
  @IsOptional() @IsNumber() @Min(0) monthlyIncome?: number;
  @IsOptional() @IsInt() @Min(300) cibilScore?: number;
}

export class ReferenceDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @Length(2, 120) name: string;
  @Matches(PHONE) phone: string;
  @IsOptional() @IsString() @Length(1, 60) relation?: string;
  @IsOptional() @IsString() @Length(0, 300) address?: string;
}

export class CreateApplicationDto {
  /** Set when raising the application off an existing lead. */
  @IsOptional() @IsString() leadId?: string;

  @IsString() loanProductId: string;

  @IsNumber() @Min(1) requestedAmount: number;

  @IsOptional() @IsInt() @Min(1) tenureMonths?: number;
  @IsOptional() @IsString() @Length(0, 500) purpose?: string;
  @IsOptional() @IsString() lenderId?: string;
  @IsOptional() @IsString() ownerId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplicantDto)
  applicants?: ApplicantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceDto)
  references?: ReferenceDto[];
}

export class UpdateApplicationDto {
  @IsOptional() @IsString() loanProductId?: string;
  @IsOptional() @IsNumber() @Min(1) requestedAmount?: number;
  @IsOptional() @IsInt() @Min(1) tenureMonths?: number;
  @IsOptional() @IsString() @Length(0, 500) purpose?: string;
  @IsOptional() @IsString() lenderId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsEnum(ApplicationStatus) status?: ApplicationStatus;
  @IsOptional() @IsDateString() bankLoginAt?: string;
  @IsOptional() @IsString() @Length(0, 80) bankReferenceNo?: string;
  @IsOptional() @IsString() @Length(0, 120) bankerName?: string;
  @IsOptional() @IsString() @Length(0, 20) bankerMobile?: string;
  @IsOptional() @IsNumber() @Min(0) loginFees?: number;
  @IsOptional() @IsString() @Length(0, 120) dsaChannel?: string;
}

export class ListApplicationsQuery {
  @IsOptional() @IsEnum(ApplicationStatus) status?: ApplicationStatus;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() lenderId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() loanProductId?: string;
  @IsOptional() @IsString() range?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  /** "true" limits to files already logged in with a bank — the Login Status tab. */
  @IsOptional() @IsBooleanString() loggedIn?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
