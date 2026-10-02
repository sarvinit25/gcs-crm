import { BANDS, bandOf, rangeOfBand } from "./credit-bands";

describe("bandOf", () => {
  it.each([
    [900, "excellent"], [750, "excellent"],
    [749, "good"], [700, "good"],
    [699, "fair"], [650, "fair"],
    [649, "low"], [300, "low"],
  ])("%i is %s", (score, band) => expect(bandOf(score)).toBe(band));

  it("has no band for a missing or impossible score", () => {
    for (const bad of [null, undefined, NaN, 299, 901, -1, 0]) expect(bandOf(bad as number | null)).toBeNull();
  });

  it("covers every score from 300 to 900 exactly once", () => {
    for (let s = 300; s <= 900; s++) {
      expect(BANDS.filter((b) => s >= b.min && s <= b.max)).toHaveLength(1);
    }
  });

  it("looks a band up by name for filtering", () => {
    expect(rangeOfBand("fair")).toMatchObject({ min: 650, max: 699 });
    expect(rangeOfBand("nope")).toBeUndefined();
  });
});
