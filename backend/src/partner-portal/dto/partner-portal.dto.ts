import { IsString, Length, Matches } from "class-validator";

export class PartnerLoginDto {
  @Matches(/^[6-9]\d{9}$/, { message: "phone must be a 10-digit Indian mobile number" })
  phone: string;

  @IsString()
  @Length(1, 128)
  password: string;
}
