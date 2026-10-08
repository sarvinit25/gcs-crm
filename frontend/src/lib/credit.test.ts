import { describe, expect, it } from "vitest";
import { BAND_STYLE, KIND_LABEL, missingForCheck } from "./credit";

describe("missingForCheck", () => {
  it("lists what the bureau still needs", () => {
    expect(missingForCheck({ hasPan: false, hasDob: false, phone: null })).toEqual(["PAN", "date of birth", "mobile number"]);
    expect(missingForCheck({ hasPan: true, hasDob: false, phone: "9000000000" })).toEqual(["date of birth"]);
    expect(missingForCheck({ hasPan: true, hasDob: true, phone: "9000000000" })).toEqual([]);
  });
});

describe("labels", () => {
  it("has a style for every band and a name for every kind of check", () => {
    for (const k of ["excellent", "good", "fair", "low"] as const) expect(BAND_STYLE[k].chip).toBeTruthy();
    expect(Object.keys(KIND_LABEL).sort()).toEqual(["LIVE", "MANUAL", "SIMULATED"]);
    expect(KIND_LABEL.SIMULATED).toBe("Simulated");
  });
});
