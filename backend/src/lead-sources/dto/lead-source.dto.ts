import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

const COLOR = /^#[0-9a-fA-F]{6}$/;

export class CreateLeadSourceDto {
  @IsString() @Length(2, 60) name: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,20}$/, { message: "code: letters, numbers, - or _ only, up to 20" }) code?: string;
  @IsOptional() @IsString() @Length(0, 200) description?: string;
  @IsOptional() @IsString() @Length(0, 40) icon?: string;
  @IsOptional() @IsString() @Matches(COLOR, { message: "color must look like #845adf" }) color?: string;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateLeadSourceDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,20}$/, { message: "code: letters, numbers, - or _ only, up to 20" }) code?: string | null;
  @IsOptional() @IsString() @Length(0, 200) description?: string | null;
  @IsOptional() @IsString() @Length(0, 40) icon?: string | null;
  @IsOptional() @IsString() @Matches(COLOR, { message: "color must look like #845adf" }) color?: string;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
