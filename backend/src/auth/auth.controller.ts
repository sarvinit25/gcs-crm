import { Body, Controller, Get, Ip, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { CurrentUser, Public, type AuthUser } from "./auth.decorators";

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
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

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
