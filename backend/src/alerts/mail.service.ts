import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Zoho keeps each region's accounts and mail on its own address. ZOHO_REGION picks one of these. */
const REGION_HOSTS: Record<string, string> = {
  in: "zoho.in",
  com: "zoho.com",
  eu: "zoho.eu",
  au: "zoho.com.au",
  jp: "zoho.jp",
  ca: "zohocloud.ca",
  sa: "zoho.sa",
};

/** What a failure means, in words staff can act on. */
function explain(step: "token" | "send", status: number, detail: string): string {
  const d = detail.toLowerCase();
  if (step === "token") {
    if (d.includes("invalid_client")) return "Zoho does not recognise the client ID or client secret. Check ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.";
    if (d.includes("invalid_code") || d.includes("invalid_token") || d.includes("invalid_grant")) {
      return "Zoho refused the refresh token. It has expired or been revoked, so a new one has to be made in the Zoho API Console.";
    }
    return `Zoho would not give an access token (HTTP ${status}). Check the client ID, client secret, refresh token and region.`;
  }
  if (status === 401 || status === 403) return "Zoho refused the email. The refresh token may be missing the ZohoMail.messages.CREATE permission, or the mail account is not the one it belongs to.";
  if (status === 404) return "Zoho could not find the mail account. Check ZOHO_ACCOUNT_ID.";
  if (status === 429) return "Zoho is limiting how fast mail can be sent. Try again in a few minutes.";
  if (d.includes("invalid") && d.includes("address")) return "Zoho does not accept the sender address. Check ZOHO_FROM_ADDRESS is the mailbox the token belongs to.";
  return `Zoho refused the email (HTTP ${status}).`;
}

/**
 * Sends email through Zoho Mail's API, the same account the website uses, so there is one mail system.
 * Needs ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ACCOUNT_ID and ZOHO_FROM_ADDRESS (the
 * mailbox the token belongs to) in the environment; ZOHO_REGION is one of in (default), com, eu, au, jp, ca or sa.
 * With any of them missing, or a region that is not on that list, it does nothing, so local development and a
 * fresh install never fail because mail is not set up.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private cached: { token: string; until: number } | null = null;
  private readonly env: Record<"id" | "secret" | "refresh" | "account" | "from", string>;
  private readonly host: string | null;
  /** Why the last send failed, in plain words. Never holds a secret. */
  lastError = "";

  constructor(config: ConfigService) {
    const get = (k: string) => (config.get<string>(k) ?? "").trim();
    this.env = {
      id: get("ZOHO_CLIENT_ID"),
      secret: get("ZOHO_CLIENT_SECRET"),
      refresh: get("ZOHO_REFRESH_TOKEN"),
      account: get("ZOHO_ACCOUNT_ID"),
      from: get("ZOHO_FROM_ADDRESS"),
    };
    const region = (get("ZOHO_REGION") || "in").toLowerCase();
    this.host = REGION_HOSTS[region] ?? null;
    if (!this.host) {
      this.log.error(`ZOHO_REGION "${region}" is not one of ${Object.keys(REGION_HOSTS).join(", ")} - email is switched off`);
    } else if (!this.enabled) {
      this.log.warn("ZOHO_* mail settings are not all set - email is switched off");
    }
  }

  get enabled() {
    const e = this.env;
    return Boolean(this.host && e.id && e.secret && e.refresh && e.account && e.from);
  }

  /** Zoho hands out a one-hour access token in exchange for the long-lived refresh token. */
  private async accessToken(): Promise<string | null> {
    if (this.cached && this.cached.until > Date.now()) return this.cached.token;
    const e = this.env;
    const res = await fetch(`https://accounts.${this.host}/oauth/v2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: e.id,
        client_secret: e.secret,
        refresh_token: e.refresh,
      }),
    });
    const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
    if (!res.ok || !json?.access_token) {
      this.lastError = explain("token", res.status, json?.error ?? "");
      this.log.error(this.lastError);
      return null;
    }
    this.cached = { token: json.access_token, until: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000 };
    return json.access_token;
  }

  /** Never throws: an alert failing must not break the enquiry that triggered it. Send `html` for a styled email. */
  async send(message: { to: string | string[]; subject: string; text?: string; html?: string }) {
    this.lastError = "";
    if (!this.enabled) return false;
    const to = (Array.isArray(message.to) ? message.to : [message.to]).filter(Boolean).join(",");
    if (!to) return false;
    try {
      const token = await this.accessToken();
      if (!token) return false;
      const e = this.env;
      const res = await fetch(`https://mail.${this.host}/api/accounts/${encodeURIComponent(e.account)}/messages`, {
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
        const body = (await res.text().catch(() => "")).slice(0, 300);
        this.lastError = explain("send", res.status, body);
        this.log.error(`Email to ${to} failed: ${this.lastError}`);
        return false;
      }
      return true;
    } catch (error) {
      this.lastError = "The mail service could not be reached. Check the server's internet connection.";
      this.log.error(`Email to ${to} failed: ${(error as Error).message}`);
      return false;
    }
  }
}
