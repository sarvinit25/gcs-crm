import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from "class-validator";

/** Shared shape for Father and Mother — the two "financial co-applicant" parents. */
export class EducationLoanParentDto {
  @IsOptional() @IsString() @Length(0, 120) contactIndia?: string;
  @IsOptional() @IsString() @Length(0, 120) contactAbroad?: string;
  @IsOptional() @IsString() @Length(0, 300) currentAddress?: string;
  @IsOptional() @IsString() @Length(0, 300) permanentAddress?: string;
  @IsOptional() @IsNumber() @Min(0) yearsAtCurrentAddress?: number;
  @IsOptional() @IsEmail() personalEmail?: string;
  @IsOptional() @IsString() @Length(0, 120) qualification?: string;
  @IsOptional() @IsString() @Length(0, 200) officeName?: string;
  @IsOptional() @IsString() @Length(0, 300) officeAddress?: string;
  @IsOptional() @IsString() @Length(0, 120) designation?: string;
  @IsOptional() @IsEmail() officeEmail?: string;
  @IsOptional() @IsNumber() @Min(0) totalExpYears?: number;
  @IsOptional() @IsNumber() @Min(0) currentCompanyExpYears?: number;
}

export class EducationLoanFriendReferenceDto {
  @IsOptional() @IsString() @Length(0, 120) name?: string;
  @IsOptional() @IsString() @Length(0, 300) address?: string;
  @IsOptional() @IsString() @Length(0, 20) phone?: string;
}

export class EducationLoanStudentDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 300) currentAddress?: string;
  @IsOptional() @IsString() @Length(0, 300) permanentAddress?: string;
  @IsOptional() @IsNumber() @Min(0) yearsAtCurrentAddress?: number;
}

export class EducationLoanCourseDto {
  @IsOptional() @IsNumber() @Min(0) loanAmount?: number;
  @IsOptional() @IsString() @Length(0, 200) courseName?: string;
  @IsOptional() @IsString() @Length(0, 60) courseDuration?: string;
  @IsOptional() @IsDateString() courseStartDate?: string;
  @IsOptional() @IsString() @Length(0, 200) universityName?: string;
  @IsOptional() @IsString() @Length(0, 80) country?: string;
}

/** The whole "Customer Details Sheet" — validated here, stored as one JSON blob. */
export class UpsertEducationLoanDetailDto {
  @IsOptional() @ValidateNested() @Type(() => EducationLoanStudentDto) student?: EducationLoanStudentDto;
  @IsOptional() @ValidateNested() @Type(() => EducationLoanParentDto) father?: EducationLoanParentDto;
  @IsOptional() @ValidateNested() @Type(() => EducationLoanParentDto) mother?: EducationLoanParentDto;

  @IsOptional() @IsString() @Length(0, 120) paternalGrandmotherName?: string;
  @IsOptional() @IsString() @Length(0, 120) maternalGrandmotherName?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationLoanFriendReferenceDto)
  friendReferences?: EducationLoanFriendReferenceDto[];

  @IsOptional() @ValidateNested() @Type(() => EducationLoanCourseDto) course?: EducationLoanCourseDto;
}
