import { IsString, Length, Matches } from "class-validator";

export class BorrowerLoginDto {
  @Matches(/^[6-9]\d{9}$/, { message: "phone must be a 10-digit Indian mobile number" })
  phone: string;

  @IsString()
  @Length(4, 20)
  accessCode: string;
}
