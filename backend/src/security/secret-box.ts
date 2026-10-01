import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts small secrets (two-step login seeds) before they reach the database,
 * so a stolen backup or read-only SQL access is not enough to mint codes.
 * AES-256-GCM; the stored form is `enc1:` + base64(iv | tag | ciphertext).
 */
const PREFIX = "enc1:";

function key(env: Record<string, string | undefined> = process.env): Buffer {
  const configured = env.SECRETS_ENCRYPTION_KEY;
  if (configured) return createHash("sha256").update(configured).digest();
  // Development and tests only — production refuses to start without its own key.
  return createHash("sha256").update(`gcs-crm:dev-secrets:${env.JWT_SECRET ?? ""}`).digest();
}

export const isEncrypted = (stored: string) => stored.startsWith(PREFIX);

export function encryptSecret(plain: string, env?: Record<string, string | undefined>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(env), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

/** Reads either form: values saved before encryption existed come back as they are. */
export function decryptSecret(stored: string, env?: Record<string, string | undefined>): string {
  if (!isEncrypted(stored)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(env), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
