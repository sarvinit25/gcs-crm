import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { ChecklistApplicantType } from "@prisma/client";

export class CreateChecklistItemDto {
  @IsOptional() @IsString() loanProductId?: string;
  @IsOptional() applicantType?: ChecklistApplicantType;

  @IsString() @Length(2, 200) label: string;
  @IsString() @Length(2, 60) category: string;

  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateChecklistItemDto {
  @IsOptional() @IsString() loanProductId?: string | null;
  @IsOptional() applicantType?: ChecklistApplicantType | null;

  @IsOptional() @IsString() @Length(2, 200) label?: string;
  @IsOptional() @IsString() @Length(2, 60) category?: string;

  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
