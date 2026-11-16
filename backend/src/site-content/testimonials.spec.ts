import { assertTestimonials, publicTestimonials } from "./site-content.controller";

const story = { name: "Asha", city: "Pune", product: "Home Loan", rating: 5, quote: "Smooth and quick.", visible: true };

describe("client stories: what may be saved", () => {
  it("accepts a plain story and one with a photo and consent", () => {
    expect(() => assertTestimonials([story])).not.toThrow();
    expect(() => assertTestimonials([{ ...story, photo: "/public/site-images/abc123", consent: { given: true, photoOk: true, how: "Signed form", date: "2026-11-01" } }])).not.toThrow();
  });
  it("refuses a shown photo without photo consent, but allows it when hidden", () => {
    expect(() => assertTestimonials([{ ...story, photo: "/public/site-images/abc123" }])).toThrow(/photo consent/);
    expect(() => assertTestimonials([{ ...story, photo: "/public/site-images/abc123", consent: { given: true, photoOk: false } }])).toThrow(/photo consent/);
    expect(() => assertTestimonials([{ ...story, visible: false, photo: "/public/site-images/abc123" }])).not.toThrow();
  });
  it("refuses a photo that was not uploaded through the CRM, and junk", () => {
    expect(() => assertTestimonials([{ ...story, photo: "https://evil.example/x.png", consent: { photoOk: true } }])).toThrow();
    expect(() => assertTestimonials("nope")).toThrow();
    expect(() => assertTestimonials([null])).toThrow();
    expect(() => assertTestimonials([{ ...story, quote: "x".repeat(1300) }])).toThrow();
  });
});

describe("client stories: what the public website sees", () => {
  it("drops hidden stories and never shows consent notes", () => {
    const out = publicTestimonials([
      { ...story, consent: { given: true, photoOk: false, note: "private note", how: "WhatsApp" } },
      { ...story, name: "Hidden One", visible: false },
    ]) as Record<string, unknown>[];
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("consent");
    expect(JSON.stringify(out)).not.toContain("private note");
    expect(JSON.stringify(out)).not.toContain("Hidden One");
  });
  it("includes the photo only when photo consent is on record", () => {
    const withConsent = publicTestimonials([{ ...story, photo: "/public/site-images/abc123", consent: { photoOk: true } }]) as Record<string, unknown>[];
    expect(withConsent[0]).toHaveProperty("photo", "/public/site-images/abc123");
    const without = publicTestimonials([{ ...story, photo: "/public/site-images/abc123", consent: { photoOk: false } }]) as Record<string, unknown>[];
    expect(without[0]).not.toHaveProperty("photo");
  });
  it("passes anything that is not a list through untouched", () => {
    expect(publicTestimonials({ a: 1 })).toEqual({ a: 1 });
  });
});
