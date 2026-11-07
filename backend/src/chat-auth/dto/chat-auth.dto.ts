import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, Matches } from "class-validator";
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

  /** Where the code is emailed as well as texted. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? undefined : typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "email must be a valid email address" })
  @Length(3, 160)
  email?: string;

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

export class ProfileAnswerDto {
  @IsString() @Length(20, 200) token: string;
  /** What the visitor wrote, exactly as they wrote it; the loan profile reads it. */
  @IsString() @Length(1, 2000) reply: string;
}
