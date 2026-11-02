import { Injectable, Logger } from "@nestjs/common";

/** The chat-completions shapes the assistant needs — nothing provider-specific leaks past this file. */
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export class ModelUnavailableError extends Error {}

/** The language model behind the assistant. Swappable so tests (and a future provider) never touch the network. */
export interface AssistantModel {
  /** False when no key is set; the service reports that instead of failing mid-chat. */
  readonly configured: boolean;
  complete(messages: ModelMessage[], tools: ToolSpec[]): Promise<Extract<ModelMessage, { role: "assistant" }>>;
}

export const ASSISTANT_MODEL = Symbol("ASSISTANT_MODEL");

const REQUEST_TIMEOUT_MS = 45_000;

@Injectable()
export class OpenAiAssistantModel implements AssistantModel {
  private readonly log = new Logger("AssistantModel");

  get configured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async complete(messages: ModelMessage[], tools: ToolSpec[]) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new ModelUnavailableError("No OpenAI key is set");

    const model = process.env.ASSISTANT_MODEL || "gpt-4.1";
    const body = {
      model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      max_tokens: 900,
    };

    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) {
          // The body can echo request content; only the status and error code are logged.
          const detail = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
          this.log.warn(`OpenAI answered ${res.status} ${detail?.error?.code ?? ""}`.trim());
          throw new ModelUnavailableError(
            res.status === 401 || res.status === 403
              ? "The OpenAI key was refused"
              : res.status === 429
                ? "The AI service is busy or out of credit"
                : `The AI service returned ${res.status}`,
          );
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
        };
        const message = json.choices?.[0]?.message;
        if (!message) throw new ModelUnavailableError("The AI service sent an empty answer");
        return { role: "assistant" as const, content: message.content ?? null, tool_calls: message.tool_calls };
      } catch (err) {
        if (err instanceof ModelUnavailableError) throw err;
        // A dropped connection is retried once; a second failure is reported.
        if (attempt >= 2) throw new ModelUnavailableError("Could not reach the AI service");
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
}
