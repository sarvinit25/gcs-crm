import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from "class-validator";

export class CreateChecklistDocumentDto {
  @IsString() @Length(2, 160) title: string;
  @IsOptional() @IsString() @Length(2, 80) productSlug?: string;
  @IsOptional() @IsString() @Length(2, 60) variant?: string;
  @IsString() @Length(2, 500) fileUrl: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateChecklistDocumentDto {
  @IsOptional() @IsString() @Length(2, 160) title?: string;
  @IsOptional() @IsString() @Length(2, 80) productSlug?: string | null;
  @IsOptional() @IsString() @Length(2, 60) variant?: string | null;
  @IsOptional() @IsString() @Length(2, 500) fileUrl?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
