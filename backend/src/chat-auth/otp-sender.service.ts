import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from "../whatsapp/whatsapp.provider";

/**
 * Sends a one-time code, or a GCS ID, to a mobile number on WhatsApp. This is only the fallback for a person we hold no
 * email for: whoever has an email gets the code there, which costs nothing. There is no SMS provider.
 *
 *   WHATSAPP_OTP_TEMPLATE=…   a Meta-approved "authentication" template whose one variable is the code
 *   WHATSAPP_ID_TEMPLATE=…    a Meta-approved template with one variable, the GCS ID (optional)
 *   WHATSAPP_OTP_LANG=en      the templates' language code (default en)
 *   WHATSAPP_OTP_BUTTON=false only if the code template has no copy-code button (authentication templates do)
 *
 * With no template set, development prints the code in the server log so the flow can be tried. Production never does
 * that: it reports the code as undelivered.
 */
@Injectable()
export class OtpSenderService {
  private readonly log = new Logger(OtpSenderService.name);
  private readonly otpTemplate: string;
  private readonly idTemplate: string;
  private readonly language: string;
  private readonly button: boolean;
  private readonly production: boolean;

  constructor(
    config: ConfigService,
    @Optional() @Inject(WHATSAPP_PROVIDER) private wa?: WhatsAppProvider,
  ) {
    this.otpTemplate = (config.get<string>("WHATSAPP_OTP_TEMPLATE") ?? "").trim();
    this.idTemplate = (config.get<string>("WHATSAPP_ID_TEMPLATE") ?? "").trim();
    this.language = (config.get<string>("WHATSAPP_OTP_LANG") ?? "").trim() || "en";
    this.button = (config.get<string>("WHATSAPP_OTP_BUTTON") ?? "").trim().toLowerCase() !== "false";
    this.production = config.get<string>("NODE_ENV") === "production";
  }

  /** Can a code go to a phone on WhatsApp? When not, a person with no email on file gets no code. */
  get whatsappReady() {
    return Boolean(this.wa && this.otpTemplate);
  }

  /** Can a GCS ID go to a phone on WhatsApp? */
  get whatsappIdReady() {
    return Boolean(this.wa && this.idTemplate);
  }

  /** True when the code reached WhatsApp (or, in development, the log). Never throws. */
  async send(phone: string, code: string, _validMinutes: number): Promise<boolean> {
    if (this.whatsappReady) {
      try {
        await this.wa!.sendTemplate(`91${phone}`, this.otpTemplate, this.language, [code], this.button ? code : undefined);
        return true;
      } catch (err) {
        this.log.error(`WhatsApp could not send the code: ${String((err as Error)?.message ?? err).slice(0, 160)}`);
        return false;
      }
    }
    if (!this.production) {
      this.log.warn(`[dev] Sign-in code for ${phone}: ${code}`);
      return true;
    }
    return false;
  }

  /** Sends a GCS ID to a number on WhatsApp. Same rules as send(). */
  async sendGcsId(phone: string, gcsId: string): Promise<boolean> {
    if (this.whatsappIdReady) {
      try {
        await this.wa!.sendTemplate(`91${phone}`, this.idTemplate, this.language, [gcsId]);
        return true;
      } catch (err) {
        this.log.error(`WhatsApp could not send the GCS ID: ${String((err as Error)?.message ?? err).slice(0, 160)}`);
        return false;
      }
    }
    if (!this.production) {
      this.log.warn(`[dev] GCS ID for ${phone}: ${gcsId}`);
      return true;
    }
    return false;
  }
}
