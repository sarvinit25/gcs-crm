import { normalizeExtraction } from "./offer-extraction";
import { evidenceSupports, fullyVerified, verifyReadings } from "./offer-verify";

const slugs = new Set(["home-loan", "bill-discounting"]);
const read = (offers: Record<string, unknown>[]) => normalizeExtraction({ kind: "LENDER_OFFER", lenderName: "X", offers }, slugs);
const o = (x: Record<string, unknown>) => ({ scheme: "SAM", productSlug: "home-loan", ...x });

describe("verifyReadings", () => {
  it("keeps figures both readings agree on and marks the reading as checked twice", () => {
    const r = verifyReadings(read([o({ minRate: 12.5, maxAmount: 3000000 })]), read([o({ minRate: 12.5, maxAmount: 3000000 })]), "text");
    expect(r.offers[0]!.minRate).toBe(12.5);
    expect(r.checks).toEqual({ readings: 2, input: "text", flags: [] });
    expect(fullyVerified(r)).toBe(true);
  });
  it("blanks a figure the two readings disagree on and says what each read (Salaried vs SAM mix-up)", () => {
    const r = verifyReadings(read([o({ minRate: 10.5 })]), read([o({ minRate: 12.5 })]), "text");
    expect(r.offers[0]!.minRate).toBeNull();
    expect(r.checks!.flags[0]).toMatchObject({ scheme: "SAM", field: "minRate", reason: "readings-differ", readingA: "10.5", readingB: "12.5" });
    expect(fullyVerified(r)).toBe(false);
  });
  it("flags a scheme only one reading found", () => {
    const r = verifyReadings(read([o({}), o({ scheme: "ITR" })]), read([o({})]), "text");
    expect(r.checks!.flags.some((f) => f.reason === "scheme-in-one-reading" && f.scheme === "ITR")).toBe(true);
  });
  it("blanks figures outside common sense", () => {
    const r = verifyReadings(read([o({ minRate: 70, maxTenureMonths: 480 })]), read([o({ minRate: 70, maxTenureMonths: 480 })]), "text");
    expect(r.offers[0]!.minRate).toBeNull();
    expect(r.checks!.flags[0]!.reason).toBe("out-of-range");
  });
  it("drops a figure whose quoted proof does not contain it (50 Cr vs 500 Cr)", () => {
    const r = verifyReadings(read([o({ minTurnover: "500 Cr", evidence: { minTurnover: "Min turnover 50 Cr" } })]), read([o({ minTurnover: "500 Cr" })]), "text");
    expect(r.offers[0]!.minTurnover).toBeNull();
    expect(r.checks!.flags[0]).toMatchObject({ reason: "proof-mismatch", evidence: "Min turnover 50 Cr" });
  });
  it("keeps a figure its proof supports", () => {
    const e = { maxAmount: "Loan up to ₹1 Crore" };
    const r = verifyReadings(read([o({ maxAmount: 10000000, evidence: e })]), read([o({ maxAmount: 10000000 })]), "text");
    expect(r.offers[0]!.maxAmount).toBe(10000000);
  });
  it("never counts a single reading or a picture as fully verified", () => {
    expect(fullyVerified(verifyReadings(read([o({})]), null, "text"))).toBe(false);
    expect(fullyVerified(verifyReadings(read([o({})]), read([o({})]), "image"))).toBe(false);
  });
});

describe("evidenceSupports", () => {
  it("understands lakh, crore, years and monthly rates", () => {
    expect(evidenceSupports("rupees", 5_000_000, "up to 50 Lakh")).toBe(true);
    expect(evidenceSupports("months", 240, "Tenure 20 years")).toBe(true);
    expect(evidenceSupports("percent", 32.4, "2.7% per month")).toBe(true);
    expect(evidenceSupports("rupees", 5_000_000, "up to 5 Lakh")).toBe(false);
  });
});
