import { readSubmission } from "./testimonial-input";

const good = { name: "Asha Kulkarni", quote: "They sorted out my home loan in two weeks and explained every step clearly.", rating: "5", consentWords: "true", signedName: "Asha Kulkarni", city: "Pune", product: "Home Loan" };

describe("the public testimonial form", () => {
  it("accepts a complete submission and cleans it", () => {
    const r = readSubmission({ ...good, name: "  Asha   Kulkarni ", role: "Teacher" }, false);
    expect(r).toMatchObject({ value: { name: "Asha Kulkarni", city: "Pune", product: "Home Loan", role: "Teacher", rating: 5, consentPhoto: false, contact: null } });
  });

  it("needs the words-and-name consent and a signature", () => {
    expect(readSubmission({ ...good, consentWords: "" }, false)).toMatchObject({ error: expect.stringMatching(/tick/i) });
    expect(readSubmission({ ...good, consentWords: "false" }, false)).toMatchObject({ error: expect.any(String) });
    expect(readSubmission({ ...good, signedName: "" }, false)).toMatchObject({ error: expect.stringMatching(/signature/i) });
  });

  it("holds photo consent only when a photo came with it", () => {
    expect(readSubmission({ ...good, consentPhoto: "true" }, true)).toMatchObject({ value: { consentPhoto: true } });
    expect(readSubmission({ ...good, consentPhoto: "true" }, false)).toMatchObject({ value: { consentPhoto: false } });
    expect(readSubmission({ ...good }, true)).toMatchObject({ value: { consentPhoto: false } });
  });

  it("checks the rating, the length of the words, and links", () => {
    for (const rating of ["0", "6", "4.5", "x", ""]) expect(readSubmission({ ...good, rating }, false)).toMatchObject({ error: expect.any(String) });
    expect(readSubmission({ ...good, quote: "Too short" }, false)).toMatchObject({ error: expect.any(String) });
    expect(readSubmission({ ...good, quote: "x".repeat(1201) }, false)).toMatchObject({ error: expect.any(String) });
    expect(readSubmission({ ...good, quote: "Great service, see https://spam.example for more of my reviews today" }, false)).toMatchObject({ error: expect.stringMatching(/links/i) });
  });

  it("drops a bot that fills the hidden field, without an error to learn from", () => {
    expect(readSubmission({ ...good, website: "http://bot.example" }, false)).toEqual({ spam: true });
  });

  it("refuses over-long optional fields and strips control characters", () => {
    expect(readSubmission({ ...good, city: "x".repeat(81) }, false)).toMatchObject({ error: expect.stringMatching(/city/i) });
    expect(readSubmission({ ...good, name: "Asha\u0000 Kulkarni" }, false)).toMatchObject({ value: { name: "Asha Kulkarni" } });
  });
});
