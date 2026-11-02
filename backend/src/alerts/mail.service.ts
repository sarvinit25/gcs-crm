import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Sends email through Zoho Mail's API, the same account the website uses, so there is one mail system.
 * Needs ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ACCOUNT_ID and ZOHO_FROM_ADDRESS (the
 * mailbox the token belongs to) in the environment; ZOHO_REGION is "in" (default) or "com". With any of them
 * missing it does nothing, so local development and a fresh install never fail because mail is not set up.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private cached: { token: string; until: number } | null = null;
  private readonly env: Record<"id" | "secret" | "refresh" | "account" | "from" | "region", string>;

  constructor(config: ConfigService) {
    const get = (k: string) => (config.get<string>(k) ?? "").trim();
    this.env = {
      id: get("ZOHO_CLIENT_ID"),
      secret: get("ZOHO_CLIENT_SECRET"),
      refresh: get("ZOHO_REFRESH_TOKEN"),
      account: get("ZOHO_ACCOUNT_ID"),
      from: get("ZOHO_FROM_ADDRESS"),
      region: get("ZOHO_REGION") === "com" ? "com" : "in",
    };
    if (!this.enabled) this.log.warn("ZOHO_* mail settings are not all set - email is switched off");
  }

  get enabled() {
    const e = this.env;
    return Boolean(e.id && e.secret && e.refresh && e.account && e.from);
  }

  /** Zoho hands out a one-hour access token in exchange for the long-lived refresh token. */
  private async accessToken(): Promise<string | null> {
    if (this.cached && this.cached.until > Date.now()) return this.cached.token;
    const e = this.env;
    const res = await fetch(`https://accounts.zoho.${e.region}/oauth/v2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: e.id,
        client_secret: e.secret,
        refresh_token: e.refresh,
      }),
    });
    const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
    if (!res.ok || !json?.access_token) {
      this.log.error(`Zoho would not give an access token (HTTP ${res.status}) - check the refresh token and client id`);
      return null;
    }
    this.cached = { token: json.access_token, until: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000 };
    return json.access_token;
  }

  /** Never throws: an alert failing must not break the enquiry that triggered it. Send `html` for a styled email. */
  async send(message: { to: string | string[]; subject: string; text?: string; html?: string }) {
    if (!this.enabled) return false;
    const to = (Array.isArray(message.to) ? message.to : [message.to]).filter(Boolean).join(",");
    if (!to) return false;
    try {
      const token = await this.accessToken();
      if (!token) return false;
      const e = this.env;
      const res = await fetch(`https://mail.zoho.${e.region}/api/accounts/${encodeURIComponent(e.account)}/messages`, {
        method: "POST",
        headers: {
          authorization: `Zoho-oauthtoken ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          fromAddress: e.from,
          toAddress: to,
          subject: message.subject,
          content: message.html ?? message.text ?? "",
          mailFormat: message.html ? "html" : "plaintext",
        }),
      });
      if (res.status === 401) this.cached = null; // token no longer good: ask for a fresh one next time
      if (!res.ok) {
        this.log.error(`Email to ${to} failed: Zoho answered HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.log.error(`Email to ${to} failed: ${(error as Error).message}`);
      return false;
    }
  }
}
