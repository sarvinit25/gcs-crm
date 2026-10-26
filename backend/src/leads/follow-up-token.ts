import { createHmac, timingSafeEqual } from "node:crypto";

const LIFETIME_MS = 2 * 60 * 60 * 1000;

const sign = (leadId: string, expires: number, secret: string) =>
  createHmac("sha256", `lead-follow-up:${secret}`).update(`${leadId}.${expires}`).digest("base64url");

/**
 * A short-lived pass handed back with a new website enquiry. It lets the same visitor add the optional
 * second form's answers to that one lead, and nobody else: without it a lead's notes cannot be written to
 * from the public site.
 */
export function issueFollowUpToken(leadId: string, secret: string, now = Date.now()): string {
  const expires = now + LIFETIME_MS;
  return `${expires}.${sign(leadId, expires, secret)}`;
}

export function checkFollowUpToken(leadId: string, token: string, secret: string, now = Date.now()): boolean {
  const [expiresText, mac] = token.split(".");
  const expires = Number(expiresText);
  if (!mac || !Number.isFinite(expires) || expires < now) return false;
  const expected = Buffer.from(sign(leadId, expires, secret));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
