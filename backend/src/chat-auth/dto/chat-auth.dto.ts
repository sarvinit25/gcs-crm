import { Transform } from "class-transformer";
import { IsOptional, IsString, Length, Matches } from "class-validator";
import { normalisePhone } from "../../common/phone.util";

const PHONE = /^[6-9]\d{9}$/;
const phone = () => Transform(({ value }) => normalisePhone(value) ?? value);

export class SendOtpDto {
  @IsString()
  @Length(2, 120)
  name: string;

  @phone()
  @Matches(PHONE, { message: "phone must be a 10-digit Indian mobile number" })
  phone: string;

  /** Cloudflare Turnstile token from the website. */
  @IsOptional()
  @IsString()
  @Length(0, 4096)
  captchaToken?: string;
}

export class VerifyOtpDto {
  @phone()
  @Matches(PHONE, { message: "phone must be a 10-digit Indian mobile number" })
  phone: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "The code is 6 digits" })
  code: string;
}

export class CheckSessionDto {
  @IsString()
  @Length(20, 200)
  token: string;
}
