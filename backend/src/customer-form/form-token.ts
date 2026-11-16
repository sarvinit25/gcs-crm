import { createHash, createHmac, randomInt, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 random bits, URL-safe: unguessable, so the link itself is the credential. */
export const generateFormToken = () => randomBytes(32).toString("base64url");

/** What the database keeps for lookup — a leaked database dump holds no usable links. */
export const hashFormToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Tokens we issue are exactly 43 URL-safe characters; anything else is rejected before touching the database. */
export const looksLikeFormToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

/** A six-digit code for the email step. */
export const generateFormCode = () => String(randomInt(100_000, 1_000_000));

const hmac = (secret: string, text: string) => createHmac("sha256", secret).update(text).digest("hex");

/** What is stored for a code: tied to the link it was sent for, so it opens nothing else. */
export const hashFormCode = (secret: string, inviteId: string, code: string) => hmac(secret, `code:${inviteId}:${code.trim()}`);

/** A pass that says "this person entered the emailed code for this link", good until `expiresAtMs`. Nothing is stored. */
export const signFormSession = (secret: string, inviteId: string, expiresAtMs: number) => `${expiresAtMs}.${hmac(secret, `session:${inviteId}:${expiresAtMs}`)}`;

export function checkFormSession(secret: string, inviteId: string, value: string | undefined, now = Date.now()): boolean {
  const m = /^(\d{10,15})\.([0-9a-f]{64})$/.exec(value ?? "");
  if (!m) return false;
  const expires = Number(m[1]);
  if (!(expires > now)) return false;
  const good = Buffer.from(hmac(secret, `session:${inviteId}:${expires}`));
  const given = Buffer.from(m[2]!);
  return good.length === given.length && timingSafeEqual(good, given);
}

/** "r•••@gmail.com", enough for them to recognise the address without handing it to someone holding the link. */
export const maskEmail = (email: string) => {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
};
