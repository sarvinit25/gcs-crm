import { SandboxProvider } from "./credit-provider";

const req = (pan: string) => ({ name: "A", pan, dateOfBirth: "1990-01-01", phone: "9000000000" });

describe("SandboxProvider", () => {
  const p = new SandboxProvider();

  it("is always marked simulated", () => {
    expect(p.kind).toBe("SIMULATED");
  });

  it("gives the same made-up score for the same PAN, whatever the case", async () => {
    const a = await p.fetch(req("ABCDE1234F"));
    const b = await p.fetch(req("abcde1234f"));
    expect(a.score).toBe(b.score);
    expect(a.reference).toBe(b.reference);
  });

  it("stays within the plausible range, starts the reference with SIM and different PANs differ", async () => {
    const seen = new Set<number>();
    for (const pan of ["ABCDE1234F", "PQRST6789K", "AAAAA0000A", "ZZZZZ9999Z", "LMNOP4321Q", "QWERT1111Y"]) {
      const r = await p.fetch(req(pan));
      expect(r.score).toBeGreaterThanOrEqual(560);
      expect(r.score).toBeLessThanOrEqual(840);
      expect(r.reference).toMatch(/^SIM-[0-9A-F]{10}$/);
      seen.add(r.score!);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
