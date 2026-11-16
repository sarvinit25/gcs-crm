// Works out which outside service a web request goes to, what it used, and a rough cost. Pure, so it is easy to test.

export type CallKind = { service: string; operation: string };

/** Which outside service a request is for, or null for anything we do not track (our own addresses, Cloudflare's spam check). */
export function classifyCall(rawUrl: string, method = "GET"): CallKind | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const path = u.pathname.toLowerCase();
  switch (u.hostname.toLowerCase()) {
    case "api.openai.com":
      return { service: "OpenAI", operation: path.includes("/responses") ? "reading documents" : path.includes("/chat/completions") ? "chat" : "other" };
    case "api.plivo.com":
      return { service: "Plivo", operation: /\/call\/?$/.test(path) ? (method === "POST" ? "call placed" : "call records") : "account" };
    case "graph.facebook.com":
      return { service: "WhatsApp (Meta)", operation: /\/messages\/?$/.test(path) && method === "POST" ? "message sent" : "other" };
    default:
      return null;
  }
}

export type Tokens = { model: string | null; tokensIn: number | null; tokensOut: number | null };

/** The model and the tokens used, from an OpenAI answer (the chat and the responses formats both). */
export function tokensFrom(body: unknown): Tokens {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const u = (b.usage && typeof b.usage === "object" ? b.usage : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  return { model: typeof b.model === "string" ? b.model.slice(0, 60) : null, tokensIn: n(u.prompt_tokens ?? u.input_tokens), tokensOut: n(u.completion_tokens ?? u.output_tokens) };
}

/** US dollars per million tokens (input, output). Only models whose price we know; others show tokens only. Check against OpenAI's price list. */
export const OPENAI_RATES: Record<string, [number, number]> = {
  "gpt-5-nano": [0.05, 0.4],
  "gpt-5-mini": [0.25, 2],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1-nano": [0.1, 0.4],
};

/** A model name with its date suffix removed, e.g. "gpt-5-nano-2025-08-07" becomes "gpt-5-nano". */
export const baseModel = (model: string | null) => (model ?? "").toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, "");

/** Estimated cost in US dollars, or null when the model's price is not in the table. */
export function estimateUsd(model: string | null, tokensIn: number, tokensOut: number): number | null {
  const rate = OPENAI_RATES[baseModel(model)];
  return rate ? (tokensIn * rate[0] + tokensOut * rate[1]) / 1_000_000 : null;
}

/** Start of the month containing `d`, in India time, as a UTC instant. `back` goes that many months earlier. */
export function istMonthStart(d: Date, back = 0): Date {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const start = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - back, 1);
  return new Date(start - 330 * 60_000);
}
