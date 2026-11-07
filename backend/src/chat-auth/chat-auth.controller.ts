import { Body, Controller, Ip, Post } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { Public } from "../auth/auth.decorators";
import { TurnstileService } from "../leads/turnstile.service";
import { ChatAuthService } from "./chat-auth.service";
import { CheckSessionDto, ProfileAnswerDto, SendOtpDto, VerifyOtpDto } from "./dto/chat-auth.dto";
import { LoanProfileService } from "../loan-profile/loan-profile.service";

/** Sign-in for the website's chat assistant: a code by SMS, then a pass the browser keeps. */
@Controller("public/chat-auth")
export class ChatAuthController {
  constructor(
    private auth: ChatAuthService,
    private turnstile: TurnstileService,
    private profile: LoanProfileService,
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

  // The Customer Loan Profile through the chat assistant. Gia asks in her own words; what the visitor says is read
  // by the same form as on WhatsApp and the phone, so only a valid value is ever stored on their lead.
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("profile/next")
  async profileNext(@Body() dto: CheckSessionDto) {
    const who = await this.auth.leadFor(dto.token);
    if (!who) return { available: false as const };
    const q = await this.profile.question(who.leadId, who.firstName, { reword: false });
    const view = await this.profile.view(who.leadId);
    return { available: true as const, key: q?.key ?? null, question: q?.text ?? null, progress: view.progress };
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("profile/answer")
  async profileAnswer(@Body() dto: ProfileAnswerDto) {
    const who = await this.auth.leadFor(dto.token);
    if (!who) return { available: false as const };
    const res = await this.profile.step(who.leadId, dto.reply, { firstName: who.firstName, reword: false });
    return { available: true as const, accepted: res.accepted, stored: res.stored ?? null, next: res.reply, nextKey: res.nextKey, progress: res.progress };
  }
}
