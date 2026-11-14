import { BadRequestException, Controller, HttpCode, NotFoundException, Post, Query, Req, type RawBodyRequest } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { timingSafeEqual } from "crypto";
import type { Request } from "express";
import { Public } from "../auth/auth.decorators";
import { VoiceService } from "./voice.service";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Where the voice agent posts its end-of-call message. Public, so every request must carry the shared secret. */
@Controller("public/voice")
export class VoiceWebhookController {
  constructor(private voice: VoiceService) {}

  @Public()
  @SkipThrottle()
  @Post("sarvam")
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Query("key") key?: string) {
    const secret = process.env.VOICE_WEBHOOK_SECRET;
    // Off until a secret is set, and indistinguishable from a missing page to anyone without it.
    if (!secret || secret.length < 16) throw new NotFoundException();
    const given = (req.headers["x-webhook-secret"] as string | undefined) ?? key ?? "";
    if (!same(given, secret)) throw new NotFoundException();

    // Read the bytes directly: call transcripts nest deeper than the blanket input ceiling allows for forms.
    let payload: unknown;
    try {
      payload = JSON.parse(req.rawBody!.toString("utf8"));
    } catch {
      throw new BadRequestException("Not JSON");
    }
    const { outcome } = await this.voice.accept(payload);
    return { ok: true, outcome };
  }
}
