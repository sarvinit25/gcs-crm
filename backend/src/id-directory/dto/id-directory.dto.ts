import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

export const DIRECTORY_TYPES = ["leads", "applications", "partners"] as const;
export type DirectoryType = (typeof DIRECTORY_TYPES)[number];

export class DirectoryQuery {
  @IsOptional() @IsEnum(DIRECTORY_TYPES) type?: DirectoryType;
  @IsOptional() @IsString() @Length(0, 100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
