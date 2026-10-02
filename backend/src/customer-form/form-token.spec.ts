import { generateFormToken, hashFormToken, looksLikeFormToken } from "./form-token";

describe("form link tokens", () => {
  it("are 43 URL-safe characters and never repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = generateFormToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(looksLikeFormToken(t)).toBe(true);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });

  it("are stored only as a hash, which differs per token and is stable", () => {
    const a = generateFormToken();
    expect(hashFormToken(a)).toBe(hashFormToken(a));
    expect(hashFormToken(a)).not.toBe(hashFormToken(generateFormToken()));
    expect(hashFormToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashFormToken(a)).not.toContain(a);
  });

  it("rejects anything that is not the shape we issue, before it reaches the database", () => {
    for (const bad of ["", "short", "x".repeat(42), "x".repeat(44), `${"x".repeat(42)}!`, "../etc/passwd", `${"x".repeat(41)}%20x`]) {
      expect(looksLikeFormToken(bad)).toBe(false);
    }
  });
});
