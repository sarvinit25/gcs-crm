// What the AI assistant may be shown. Every record is cleaned here before it reaches the model: identity numbers,
// bank account details and anything secret never leave the CRM, and long lists are cut short.

const HIDDEN = /pan|aadhaar|aadhar|account(number|no)?$|accountnumber|ifsc|password|hash|token|secret|otp|dob|dateofbirth|passport|voter|gstin/i;
const MAX_ITEMS = 12;
const MAX_TEXT = 400;
const MAX_DEPTH = 5;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toNumber" in (value as object) && typeof (value as { toNumber: unknown }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  if (depth >= MAX_DEPTH) return null;
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (HIDDEN.test(k)) continue;
      // Storage paths and ids of files are of no use to a question and not for the model to see.
      if (/^(storageKey|fileKey|path|url)$/i.test(k)) continue;
      out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return null;
}
