import { ArrayMaxSize, IsArray, IsString, Length } from "class-validator";

export class SaveReportTemplateDto {
  @IsString() @Length(1, 40) type: string;
  @IsString() @Length(1, 80) name: string;
  @IsArray() @ArrayMaxSize(300) @IsString({ each: true }) @Length(1, 60, { each: true }) columns: string[];
}
