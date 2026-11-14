import { normalisePhone } from "../common/phone.util";

/**
 * What we pull out of a voice agent's end-of-call message.
 * Sarvam's inbound payload is not documented the way its campaign payload is, so the reader looks for each
 * detail under several likely names, at any depth, and the whole raw message is kept next to the result.
 */
export type CallDetails = {
  callId: string | null;
  phone: string | null;
  name: string | null;
  city: string | null;
  amount: number | null;
  loanType: string | null;
  summary: string | null;
  transcript: string | null;
  durationSec: number | null;
  status: string | null;
  connected: boolean;
};

const MAX_DEPTH = 4;
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Names are tried in the order given; for each, the shallowest match wins, so top-level fields beat nested ones. */
function find(root: unknown, names: string[]): unknown {
  for (const name of names) {
    const wanted = norm(name);
    let level: unknown[] = [root];
    for (let depth = 0; depth <= MAX_DEPTH && level.length; depth++) {
      const next: unknown[] = [];
      for (const node of level) {
        if (!node || typeof node !== "object" || Array.isArray(node)) continue;
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (norm(key) === wanted && value !== null && value !== undefined && value !== "") return value;
          if (value && typeof value === "object") next.push(value);
        }
      }
      level = next;
    }
  }
  return undefined;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().replace(/,/g, "");
  const m = s.match(/(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l|k|thousand)?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2];
  const factor = !unit ? 1 : unit.startsWith("cr") ? 1e7 : ["lakh", "lac", "l"].includes(unit) ? 1e5 : 1e3;
  return Math.round(n * factor);
};

/** Ten digits for an Indian mobile (starts 6 to 9), otherwise null. */
export function indianMobile(v: unknown): string | null {
  const d = normalisePhone(v);
  return d && /^[6-9]\d{9}$/.test(d) ? d : null;
}

function transcriptText(v: unknown): string | null {
  if (typeof v === "string") return text(v, 20000);
  if (!Array.isArray(v)) return null;
  const lines = v
    .map((turn) => {
      if (!turn || typeof turn !== "object") return null;
      const t = turn as Record<string, unknown>;
      const said = text(t.text ?? t.content ?? t.message ?? t.transcript, 2000);
      if (!said) return null;
      const who = text(t.role ?? t.speaker, 20);
      return who ? `${who}: ${said}` : said;
    })
    .filter((l): l is string => Boolean(l));
  return lines.length ? lines.join("\n").slice(0, 20000) : null;
}

export function readCall(payload: unknown): CallDetails {
  const callId = text(find(payload, ["interaction_id", "interactionId", "call_id", "callId", "call_uuid", "attempt_id", "id"]), 120);
  // Who rang us: prefer fields that name the caller; the number we own is never the answer.
  const phone = indianMobile(
    find(payload, ["from", "from_number", "caller", "caller_number", "caller_id", "customer_number", "customer_phone", "phone_number", "phone", "mobile"]),
  );
  const durationRaw = num(find(payload, ["duration", "duration_sec", "duration_seconds", "call_duration", "billsec"]));
  const status = text(find(payload, ["status", "call_status", "completion_status", "hangup_cause"]), 60);
  const transcript = transcriptText(find(payload, ["transcript", "transcripts", "conversation", "messages"]));
  const failed = status ? /fail|error|busy|no[-_ ]?answer|not[-_ ]?connected|cancel/i.test(status) : false;
  const connectedFlag = find(payload, ["connected", "is_connected"]);

  return {
    callId,
    phone,
    name: text(find(payload, ["name", "customer_name", "caller_name", "full_name", "lead_name"]), 120),
    city: text(find(payload, ["city", "location", "customer_city"]), 80),
    amount: num(find(payload, ["loan_amount", "amount", "required_amount", "loan_requirement"])),
    loanType: text(find(payload, ["loan_type", "loan_product", "product", "loan_purpose", "purpose"]), 120),
    summary: text(find(payload, ["summary", "call_summary", "conversation_summary", "notes"]), 1500),
    transcript,
    durationSec: durationRaw === null ? null : Math.max(0, Math.round(durationRaw)),
    status,
    connected: connectedFlag === false ? false : !failed && (Boolean(transcript) || (durationRaw ?? 0) > 0),
  };
}
