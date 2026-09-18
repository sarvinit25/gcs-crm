import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile check on the public lead intake. Without it the endpoint
 * is an open write into the leads table for anyone who finds the URL.
 */
@Injectable()
export class TurnstileService implements OnModuleInit {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secret?: string;

  constructor(private config: ConfigService) {
    this.secret = config.get<string>("TURNSTILE_SECRET") || undefined;
  }

  onModuleInit() {
    if (this.secret) return;

    // Fail closed in production: an unprotected public write endpoint is not
    // something to discover after launch.
    if (this.config.get<string>("NODE_ENV") === "production") {
      throw new Error("TURNSTILE_SECRET is required in production — public lead intake would be unprotected");
    }
    this.logger.warn("TURNSTILE_SECRET not set — captcha checks are skipped (development only)");
  }

  get enabled() {
    return Boolean(this.secret);
  }

  async verify(token: string | undefined, remoteIp?: string) {
    if (!this.secret) return;

    if (!token) throw new BadRequestException("Captcha verification is required");

    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    let outcome: { success: boolean; "error-codes"?: string[] };
    try {
      const res = await fetch(VERIFY_URL, { method: "POST", body });
      outcome = (await res.json()) as typeof outcome;
    } catch (err) {
      // Treat an unreachable verifier as a failure rather than waving traffic through.
      this.logger.error(`Turnstile verification call failed: ${String(err)}`);
      throw new BadRequestException("Captcha could not be verified, please try again");
    }

    if (!outcome.success) {
      this.logger.warn(`Turnstile rejected a submission: ${outcome["error-codes"]?.join(", ")}`);
      throw new BadRequestException("Captcha verification failed");
    }
  }
}
