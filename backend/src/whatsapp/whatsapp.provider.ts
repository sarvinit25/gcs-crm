import { Injectable, Logger } from "@nestjs/common";
import { MetaTemplateStatus } from "@prisma/client";

export const WHATSAPP_PROVIDER = Symbol("WHATSAPP_PROVIDER");

export class ProviderError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

export type SendResult = { waMessageId: string };

export type ConnectionInfo = {
  state: "not_configured" | "connected" | "error";
  provider: "meta" | "sandbox" | "none";
  phoneNumber?: string;
  verifiedName?: string;
  quality?: string;
  codeVerification?: string;
  phoneNumberId?: string;
  wabaId?: string;
  message?: string;
};

export type TemplateSubmission = {
  name: string;
  language: string;
  /** Wording with Meta's numbered placeholders: "Hi {{1}}, …". */
  body: string;
  /** One sample value per placeholder — Meta will not review a template without them. */
  examples: string[];
};

/** Everything the CRM needs from WhatsApp. Swappable, so tests and local work never reach Meta. */
export interface WhatsAppProvider {
  readonly kind: "meta" | "sandbox" | "none";
  readonly configured: boolean;
  /** True when a template must be approved by Meta before it can be sent. */
  readonly requiresApproval: boolean;
  sendText(to: string, body: string): Promise<SendResult>;
  sendTemplate(to: string, name: string, language: string, params: string[]): Promise<SendResult>;
  submitTemplate(template: TemplateSubmission): Promise<{ status: MetaTemplateStatus; reason?: string }>;
  listTemplates(): Promise<{ name: string; status: MetaTemplateStatus; reason?: string }[]>;
  connection(): Promise<ConnectionInfo>;
}

const env = (key: string) => process.env[key]?.trim() || "";

const META_STATUS: Record<string, MetaTemplateStatus> = {
  APPROVED: MetaTemplateStatus.APPROVED,
  PENDING: MetaTemplateStatus.PENDING,
  IN_APPEAL: MetaTemplateStatus.PENDING,
  REJECTED: MetaTemplateStatus.REJECTED,
  PAUSED: MetaTemplateStatus.PAUSED,
  DISABLED: MetaTemplateStatus.PAUSED,
};

/** Meta's WhatsApp Cloud API, called directly — no middleman. Credentials come from the server's environment. */
@Injectable()
export class MetaCloudProvider implements WhatsAppProvider {
  readonly kind = "meta" as const;
  readonly requiresApproval = true;
  private readonly log = new Logger("WhatsApp");

  get configured() {
    return Boolean(env("WHATSAPP_ACCESS_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID"));
  }

  private get base() {
    return `https://graph.facebook.com/${env("WHATSAPP_API_VERSION") || "v23.0"}`;
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    if (!this.configured) throw new ProviderError("WhatsApp isn't connected — the Meta credentials are missing on the server");
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method: init.method ?? "GET",
        headers: {
          authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}`,
          ...(init.body !== undefined && { "content-type": "application/json" }),
        },
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ProviderError("Could not reach WhatsApp (Meta). Check the server's internet connection.");
    }
    const json = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string; code?: number; error_data?: { details?: string } } })
      | null;
    if (!res.ok || json?.error) {
      const e = json?.error;
      // Only Meta's own error code and wording are kept — never the token or the message text.
      this.log.warn(`Meta answered ${res.status} code ${e?.code ?? "?"}`);
      throw new ProviderError(
        [e?.message ?? `Meta returned ${res.status}`, e?.error_data?.details].filter(Boolean).join(" — "),
        e?.code,
      );
    }
    return json as T;
  }

  async sendText(to: string, body: string) {
    const res = await this.call<{ messages?: { id: string }[] }>(`/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
      method: "POST",
      body: { messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: false } },
    });
    return { waMessageId: res.messages?.[0]?.id ?? "" };
  }

  async sendTemplate(to: string, name: string, language: string, params: string[]) {
    const res = await this.call<{ messages?: { id: string }[] }>(`/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name,
          language: { code: language },
          ...(params.length && {
            components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
          }),
        },
      },
    });
    return { waMessageId: res.messages?.[0]?.id ?? "" };
  }

  async submitTemplate(t: TemplateSubmission) {
    const wabaId = env("WHATSAPP_WABA_ID");
    if (!wabaId) throw new ProviderError("WHATSAPP_WABA_ID is not set, so templates can't be sent to Meta");
    const res = await this.call<{ id: string; status?: string }>(`/${wabaId}/message_templates`, {
      method: "POST",
      body: {
        name: t.name,
        language: t.language,
        category: "UTILITY",
        components: [
          {
            type: "BODY",
            text: t.body,
            ...(t.examples.length && { example: { body_text: [t.examples] } }),
          },
        ],
      },
    });
    return { status: META_STATUS[res.status ?? "PENDING"] ?? MetaTemplateStatus.PENDING };
  }

  async listTemplates() {
    const wabaId = env("WHATSAPP_WABA_ID");
    if (!wabaId) throw new ProviderError("WHATSAPP_WABA_ID is not set, so templates can't be read from Meta");
    const res = await this.call<{ data?: { name: string; status: string; rejected_reason?: string }[] }>(
      `/${wabaId}/message_templates?fields=name,status,rejected_reason&limit=200`,
    );
    return (res.data ?? []).map((t) => ({
      name: t.name,
      status: META_STATUS[t.status] ?? MetaTemplateStatus.PENDING,
      reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : undefined,
    }));
  }

  async connection(): Promise<ConnectionInfo> {
    const base = {
      provider: "meta" as const,
      phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID") || undefined,
      wabaId: env("WHATSAPP_WABA_ID") || undefined,
    };
    if (!this.configured) {
      return { ...base, state: "not_configured", message: "The Meta access token and phone number ID are not set on the server." };
    }
    try {
      const info = await this.call<{
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
        code_verification_status?: string;
      }>(`/${env("WHATSAPP_PHONE_NUMBER_ID")}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`);
      return {
        ...base,
        state: "connected",
        phoneNumber: info.display_phone_number,
        verifiedName: info.verified_name,
        quality: info.quality_rating,
        codeVerification: info.code_verification_status,
      };
    } catch (err) {
      return { ...base, state: "error", message: (err as Error).message };
    }
  }
}

/**
 * For local work and demos only: nothing leaves the machine, every template is
 * approved at once. Refused in production, so a customer can never be told a
 * message went out when it did not.
 */
@Injectable()
export class SandboxWhatsAppProvider implements WhatsAppProvider {
  readonly kind = "sandbox" as const;
  readonly requiresApproval = false;
  sent: { to: string; kind: "text" | "template"; body?: string; name?: string; params?: string[] }[] = [];
  private counter = 0;

  get configured() {
    return process.env.NODE_ENV !== "production";
  }

  async sendText(to: string, body: string) {
    this.sent.push({ to, kind: "text", body });
    return { waMessageId: `sandbox.${++this.counter}` };
  }
  async sendTemplate(to: string, name: string, _language: string, params: string[]) {
    this.sent.push({ to, kind: "template", name, params });
    return { waMessageId: `sandbox.${++this.counter}` };
  }
  async submitTemplate() {
    return { status: MetaTemplateStatus.APPROVED };
  }
  async listTemplates() {
    return [];
  }
  async connection(): Promise<ConnectionInfo> {
    return {
      state: "connected",
      provider: "sandbox",
      phoneNumber: "Sandbox — no real messages are sent",
      message: "Running in sandbox mode for testing. Nothing reaches WhatsApp.",
    };
  }
}

/** No credentials, no sandbox: every send explains what is missing. */
@Injectable()
export class UnconfiguredWhatsAppProvider implements WhatsAppProvider {
  readonly kind = "none" as const;
  readonly configured = false;
  readonly requiresApproval = true;
  private fail(): never {
    throw new ProviderError("WhatsApp isn't connected yet");
  }
  sendText(): Promise<SendResult> {
    return this.fail();
  }
  sendTemplate(): Promise<SendResult> {
    return this.fail();
  }
  submitTemplate(): Promise<{ status: MetaTemplateStatus }> {
    return this.fail();
  }
  listTemplates(): Promise<never[]> {
    return this.fail();
  }
  async connection(): Promise<ConnectionInfo> {
    return { state: "not_configured", provider: "none", message: "WhatsApp isn't connected yet." };
  }
}

/** Chosen once at start-up from the environment. WHATSAPP_PROVIDER=sandbox is honoured outside production only. */
export function createWhatsAppProvider(): WhatsAppProvider {
  if (env("WHATSAPP_PROVIDER") === "sandbox" && process.env.NODE_ENV !== "production") return new SandboxWhatsAppProvider();
  return new MetaCloudProvider();
}
