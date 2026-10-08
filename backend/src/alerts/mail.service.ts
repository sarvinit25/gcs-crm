import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

/**
 * Sends email through the SMTP account in the environment (SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASS, SMTP_FROM). With no SMTP_HOST it does nothing, so local development and a fresh
 * install never fail because mail is not set up yet.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private transport: Transporter | null = null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>("SMTP_HOST");
    this.from = config.get<string>("SMTP_FROM") || config.get<string>("SMTP_USER") || "";
    if (!host) {
      this.log.warn("SMTP_HOST is not set - email alerts are switched off");
      return;
    }
    const port = Number(config.get<string>("SMTP_PORT") ?? 587);
    const user = config.get<string>("SMTP_USER");
    const pass = config.get<string>("SMTP_PASS");
    this.transport = createTransport({
      host,
      port,
      secure: port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  get enabled() {
    return this.transport !== null;
  }

  /** Never throws: an alert failing must not break the enquiry that triggered it. */
  async send(message: { to: string | string[]; subject: string; text: string; replyTo?: string }) {
    if (!this.transport) return false;
    try {
      await this.transport.sendMail({ from: this.from, ...message });
      return true;
    } catch (error) {
      this.log.error(`Email to ${String(message.to)} failed: ${(error as Error).message}`);
      return false;
    }
  }
}
