import { base32Decode, base32Encode, generateTotpSecret, otpauthUrl, totpAt, verifyTotp } from "./totp";

// RFC 6238 Appendix B: SHA-1 secret is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("matches the official 8-digit test vector at t=%i", (t, expected) => {
    expect(totpAt(RFC_SECRET, t, 8)).toBe(expected);
  });

  it("produces the 6-digit form of the same code", () => {
    expect(totpAt(RFC_SECRET, 59)).toBe("287082");
  });

  it("round-trips base32", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(() => base32Decode("not valid!")).toThrow();
  });

  it("accepts the current code and one step of drift, nothing else", () => {
    const now = 1_700_000_000_000;
    const code = totpAt(RFC_SECRET, now / 1000);
    expect(verifyTotp(RFC_SECRET, code, now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, now + 30_000)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, now - 30_000)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, now + 90_000)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "000000", now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBe(false);
  });

  it("ignores spaces as typed from an app", () => {
    const now = 1_700_000_000_000;
    const code = totpAt(RFC_SECRET, now / 1000);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
  });

  it("builds an otpauth link an authenticator app understands", () => {
    const url = otpauthUrl("a@b.in", "GCS CRM", "ABC234");
    expect(url).toBe("otpauth://totp/GCS%20CRM%3Aa%40b.in?secret=ABC234&issuer=GCS%20CRM&algorithm=SHA1&digits=6&period=30");
  });
});
