import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
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
import { ApplicantConstitution, EmploymentType } from "@prisma/client";

const PHONE = /^[6-9]\d{9}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

class FormReferenceDto {
  @IsString() @Length(2, 120) name: string;
  @Matches(PHONE, { message: "phone must be a 10-digit Indian mobile number" }) phone: string;
  @IsOptional() @IsString() @Length(1, 60) relation?: string;
  @IsOptional() @IsString() @Length(0, 300) address?: string;
}

/** What a customer may save as they go. Every field is optional; null clears one. */
export class SaveFormDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string | null;
  @IsOptional() @IsEmail() @Length(3, 160) email?: string | null;
  @IsOptional() @Matches(DAY, { message: "dateOfBirth must be a date like 1990-05-17" }) dateOfBirth?: string | null;
  @IsOptional() @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: "PAN must look like ABCDE1234F" }) pan?: string | null;
  @IsOptional() @Matches(/^\d{4}$/, { message: "Enter the last 4 digits of your Aadhaar" }) aadhaarLast4?: string | null;
  @IsOptional() @IsString() @Length(0, 300) address?: string | null;
  @IsOptional() @IsString() @Length(0, 80) city?: string | null;
  @IsOptional() @Matches(/^\d{6}$/, { message: "Pincode must be 6 digits" }) pincode?: string | null;
  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType | null;
  @IsOptional() @IsEnum(ApplicantConstitution) constitution?: ApplicantConstitution | null;
  @IsOptional() @IsBoolean() isNRI?: boolean | null;
  @IsOptional() @IsString() @Length(0, 160) employerName?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(1e10) monthlyIncome?: number | null;
  @IsOptional() @IsNumber() @Min(1) @Max(1e11) requestedAmount?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(600) tenureMonths?: number | null;
  @IsOptional() @IsString() @Length(0, 500) purpose?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => FormReferenceDto)
  references?: FormReferenceDto[] | null;
}

export class SubmitFormDto {
  /** The customer's own confirmation that the details are true and may be shared with lenders. */
  @IsBoolean() @Equals(true, { message: "Please tick the declaration to continue" }) declaration: boolean;
}
