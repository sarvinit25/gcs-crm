import { Body, Controller, Ip, Post } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { Public } from "../auth/auth.decorators";
import { TurnstileService } from "../leads/turnstile.service";
import { ChatAuthService } from "./chat-auth.service";
import { CheckSessionDto, SendOtpDto, VerifyOtpDto } from "./dto/chat-auth.dto";

/** Sign-in for the website's chat assistant: a code by SMS, then a pass the browser keeps. */
@Controller("public/chat-auth")
export class ChatAuthController {
  constructor(
    private auth: ChatAuthService,
    private turnstile: TurnstileService,
  ) {}

  // Every code is a paid SMS, so asking is held tight per visitor on top of the per-number limits.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @Post("send")
  async send(@Body() dto: SendOtpDto, @Ip() ip: string) {
    await this.turnstile.verify(dto.captchaToken, ip);
    return this.auth.sendCode(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 10 * 60_000 } })
  @Post("verify")
  verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verify(dto);
  }

  // Called by the website's server before it answers, so it must not be capped like a visitor.
  // The 256-bit token is the secret; there is nothing to guess.
  @Public()
  @SkipThrottle()
  @Post("session")
  session(@Body() dto: CheckSessionDto) {
    return this.auth.check(dto.token);
  }

  // Also called by the website's server: it saw an off-topic message and counts it against the number.
  @Public()
  @SkipThrottle()
  @Post("strike")
  strike(@Body() dto: CheckSessionDto) {
    return this.auth.strike(dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("end")
  end(@Body() dto: CheckSessionDto) {
    return this.auth.end(dto.token);
  }
}
