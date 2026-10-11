import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Delivers the one-time code as an SMS. The provider is chosen in the environment:
 *
 *   SMS_PROVIDER=msg91  MSG91_AUTH_KEY=…  MSG91_TEMPLATE_ID=…   (an OTP template approved on DLT)
 *
 * With no provider, development prints the code in the server log so the flow can be tried
 * without paying for an SMS. Production never does that: it reports the code as undelivered.
 */
@Injectable()
export class OtpSenderService {
  private readonly log = new Logger(OtpSenderService.name);
  private readonly provider: string;
  private readonly authKey: string;
  private readonly templateId: string;
  private readonly production: boolean;

  constructor(config: ConfigService) {
    this.provider = (config.get<string>("SMS_PROVIDER") ?? "").trim().toLowerCase();
    this.authKey = config.get<string>("MSG91_AUTH_KEY") ?? "";
    this.templateId = config.get<string>("MSG91_TEMPLATE_ID") ?? "";
    this.production = config.get<string>("NODE_ENV") === "production";
    if (this.production && !this.configured) {
      this.log.warn("No SMS provider is set (SMS_PROVIDER, MSG91_AUTH_KEY, MSG91_TEMPLATE_ID): the website chat cannot send codes");
    }
  }

  private get configured() {
    return this.provider === "msg91" && Boolean(this.authKey && this.templateId);
  }

  /** True when the code reached the provider (or, in development, the log). Never throws. */
  async send(phone: string, code: string, validMinutes: number): Promise<boolean> {
    if (this.configured) return this.sendMsg91(phone, code, validMinutes);
    if (!this.production) {
      this.log.warn(`[dev] Chat sign-in code for ${phone}: ${code}`);
      return true;
    }
    return false;
  }

  private async sendMsg91(phone: string, code: string, validMinutes: number) {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", this.templateId);
    url.searchParams.set("mobile", `91${phone}`);
    url.searchParams.set("otp", code);
    url.searchParams.set("otp_expiry", String(validMinutes));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { authkey: this.authKey, "content-type": "application/json", accept: "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
      if (res.ok && json.type === "success") return true;
      this.log.error(`MSG91 refused the code (${res.status}): ${String(json.message ?? json.type ?? "").slice(0, 160)}`);
    } catch (err) {
      this.log.error(`MSG91 could not be reached: ${String(err).slice(0, 160)}`);
    }
    return false;
  }
}
