import { Body, Controller, Get, Ip, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsEmail, IsString, Length, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { CurrentUser, Public, type AuthUser } from "./auth.decorators";

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

class VerifyTwoFactorDto {
  @IsString() challengeToken: string;
  @IsString() @Length(6, 8) code: string;
}

class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @Length(8, 128) newPassword: string;
}

class CodeDto {
  @IsString() @Length(6, 8) code: string;
}

class DisableTwoFactorDto extends CodeDto {
  @IsString() password: string;
}

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  // Slows password guessing against a known staff email.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post("login")
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.email, dto.password, ip);
  }

  // Six digits is guessable in bulk, so this is throttled as tightly as the password.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Public()
  @Post("2fa/verify")
  verifyTwoFactor(@Body() dto: VerifyTwoFactorDto, @Ip() ip: string) {
    return this.auth.verifyTwoFactor(dto.challengeToken, dto.code, ip);
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("change-password")
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword, ip);
  }

  @Post("2fa/setup")
  setupTwoFactor(@CurrentUser() user: AuthUser) {
    return this.auth.setupTwoFactor(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("2fa/enable")
  enableTwoFactor(@Body() dto: CodeDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.auth.enableTwoFactor(user, dto.code, ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("2fa/disable")
  disableTwoFactor(@Body() dto: DisableTwoFactorDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.auth.disableTwoFactor(user, dto.password, dto.code, ip);
  }
}
