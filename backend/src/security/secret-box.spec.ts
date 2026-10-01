import { decryptSecret, encryptSecret, isEncrypted } from "./secret-box";

const env = { SECRETS_ENCRYPTION_KEY: "k".repeat(40), JWT_SECRET: "j".repeat(40) };

describe("secret box", () => {
  it("round-trips and never stores the secret in the clear", () => {
    const stored = encryptSecret("JBSWY3DPEHPK3PXP", env);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(stored, env)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("uses a fresh nonce each time", () => {
    expect(encryptSecret("same", env)).not.toBe(encryptSecret("same", env));
  });

  it("reads a value saved before encryption existed as it is", () => {
    expect(decryptSecret("JBSWY3DPEHPK3PXP", env)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("fails loudly with the wrong key or a tampered value", () => {
    const stored = encryptSecret("secret", env);
    expect(() => decryptSecret(stored, { ...env, SECRETS_ENCRYPTION_KEY: "x".repeat(40) })).toThrow();
    const flipped = stored.slice(0, -2) + (stored.endsWith("A") ? "B" : "A") + stored.slice(-1);
    expect(() => decryptSecret(flipped, env)).toThrow();
  });

  it("falls back to a development key derived from the JWT secret when none is set", () => {
    const dev = { JWT_SECRET: "j".repeat(40) };
    expect(decryptSecret(encryptSecret("abc", dev), dev)).toBe("abc");
  });
});
