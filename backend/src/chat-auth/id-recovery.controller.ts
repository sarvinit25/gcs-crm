import { Body, Controller, Ip, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/auth.decorators";
import { TurnstileService } from "../leads/turnstile.service";
import { IdRecoveryService } from "./id-recovery.service";
import { SendIdCodeDto, VerifyIdCodeDto } from "./dto/id-recovery.dto";

/** "Do not have a GCS ID?" on the website's Track Application page: a code to the mobile, then the ID by SMS. */
@Controller("public/id-recovery")
export class IdRecoveryController {
  constructor(
    private recovery: IdRecoveryService,
    private turnstile: TurnstileService,
  ) {}

  // Every code is a paid SMS, so asking is held tight per visitor on top of the per-number limits.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @Post("send")
  async send(@Body() dto: SendIdCodeDto, @Ip() ip: string) {
    await this.turnstile.verify(dto.captchaToken, ip);
    return this.recovery.sendCode(dto, ip);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 10 * 60_000 } })
  @Post("verify")
  verify(@Body() dto: VerifyIdCodeDto) {
    return this.recovery.verify(dto);
  }
}
