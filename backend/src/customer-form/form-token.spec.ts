import { checkFormSession, generateFormCode, generateFormToken, hashFormCode, hashFormToken, looksLikeFormToken, maskEmail, signFormSession } from "./form-token";

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

describe("the emailed code that opens a form link", () => {
  const secret = "test-secret";
  it("is six digits, and its stored form is tied to one link", () => {
    for (let i = 0; i < 50; i++) expect(generateFormCode()).toMatch(/^\d{6}$/);
    expect(hashFormCode(secret, "inviteA", "123456")).toBe(hashFormCode(secret, "inviteA", "123456"));
    expect(hashFormCode(secret, "inviteA", "123456")).not.toBe(hashFormCode(secret, "inviteB", "123456"));
    expect(hashFormCode(secret, "inviteA", "123456")).not.toBe(hashFormCode(secret, "inviteA", "654321"));
  });
  it("gives a pass that works for that link until it runs out", () => {
    const now = 1_800_000_000_000;
    const pass = signFormSession(secret, "inviteA", now + 3_600_000);
    expect(checkFormSession(secret, "inviteA", pass, now)).toBe(true);
    expect(checkFormSession(secret, "inviteB", pass, now)).toBe(false);
    expect(checkFormSession("other-secret", "inviteA", pass, now)).toBe(false);
    expect(checkFormSession(secret, "inviteA", pass, now + 3_600_001)).toBe(false);
  });
  it("refuses a missing, mangled or tampered pass", () => {
    const now = 1_800_000_000_000;
    const pass = signFormSession(secret, "inviteA", now + 1000);
    for (const bad of [undefined, "", "x", "123.456", pass.replace(/.$/, (c) => (c === "0" ? "1" : "0")), `${now + 9_999_999}.${pass.split(".")[1]}`]) {
      expect(checkFormSession(secret, "inviteA", bad, now)).toBe(false);
    }
  });
  it("shows only the first letter of an email", () => {
    expect(maskEmail("ramesh@gmail.com")).toBe("r•••@gmail.com");
  });
});
