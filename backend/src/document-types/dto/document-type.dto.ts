import { ChecklistApplicantType } from "@prisma/client";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

const CODE = /^[A-Za-z0-9_-]{1,30}$/;
const CODE_MESSAGE = "code: letters, numbers, - or _ only, up to 30";

export class CreateDocumentTypeDto {
  @IsString() @Length(2, 200) name: string;
  @IsString() @Length(2, 60) category: string;
  @IsOptional() @IsString() @Matches(CODE, { message: CODE_MESSAGE }) code?: string;
  @IsOptional() @IsString() @Length(0, 300) description?: string;
  // Empty or missing means "every loan type" / "every applicant profile".
  @IsOptional() @IsArray() @IsString({ each: true }) loanProductIds?: string[];
  @IsOptional() @IsArray() @IsEnum(ChecklistApplicantType, { each: true }) applicantTypes?: ChecklistApplicantType[];
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateDocumentTypeDto {
  @IsOptional() @IsString() @Length(2, 200) name?: string;
  @IsOptional() @IsString() @Length(2, 60) category?: string;
  @IsOptional() @IsString() @Matches(CODE, { message: CODE_MESSAGE }) code?: string | null;
  @IsOptional() @IsString() @Length(0, 300) description?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) loanProductIds?: string[];
  @IsOptional() @IsArray() @IsEnum(ChecklistApplicantType, { each: true }) applicantTypes?: ChecklistApplicantType[];
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
