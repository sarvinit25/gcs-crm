import { IsArray, IsBoolean, IsOptional, IsString, Length } from "class-validator";

export class CreateTeamDto {
  @IsString() @Length(2, 60) name: string;
  @IsOptional() @IsString() @Length(0, 200) description?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) memberIds?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateTeamDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsString() @Length(0, 200) description?: string | null;
  @IsOptional() @IsString() leadId?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) memberIds?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}
