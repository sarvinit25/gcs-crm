import { createHash, randomBytes } from "node:crypto";

/** 256 random bits, URL-safe: unguessable, so the link itself is the credential. */
export const generateFormToken = () => randomBytes(32).toString("base64url");

/** What the database keeps for lookup — a leaked database dump holds no usable links. */
export const hashFormToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Tokens we issue are exactly 43 URL-safe characters; anything else is rejected before touching the database. */
export const looksLikeFormToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
