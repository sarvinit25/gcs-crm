import { resolveChecklistBucket } from "./checklist.service";

describe("resolveChecklistBucket", () => {
  it("NRI overrides everything else", () => {
    expect(resolveChecklistBucket({ isNRI: true, employmentType: "SALARIED", constitution: null })).toBe("NRI");
  });

  it("maps employment and constitution to a document set", () => {
    expect(resolveChecklistBucket({ isNRI: false, employmentType: "SALARIED", constitution: null })).toBe("SALARIED");
    expect(resolveChecklistBucket({ isNRI: false, employmentType: "PROFESSIONAL", constitution: null })).toBe("PROFESSIONAL");
    expect(resolveChecklistBucket({ isNRI: false, employmentType: "BUSINESS", constitution: "LLP" })).toBe("LLP");
    expect(resolveChecklistBucket({ isNRI: false, employmentType: "SELF_EMPLOYED", constitution: "PRIVATE_LIMITED" })).toBe("PRIVATE_LIMITED");
  });

  it("falls back to universal items only when the profile is unknown", () => {
    expect(resolveChecklistBucket(null)).toBeNull();
    expect(resolveChecklistBucket({ isNRI: false, employmentType: "BUSINESS", constitution: "OTHER" })).toBeNull();
  });
});
