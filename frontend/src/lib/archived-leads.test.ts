import { describe, expect, it } from "vitest";
import { convertedShare, daysLabel } from "./archived-leads";

describe("archived leads display", () => {
  it("says how long a lead took in plain words", () => {
    expect(daysLabel(0)).toBe("Same day");
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(12)).toBe("12 days");
    expect(daysLabel(null)).toBe("—");
    expect(daysLabel(undefined)).toBe("—");
  });

  it("works out the converted share, and copes with nothing archived", () => {
    expect(convertedShare({ total: 8, converted: 2 })).toBe(25);
    expect(convertedShare({ total: 3, converted: 1 })).toBe(33);
    expect(convertedShare({ total: 0, converted: 0 })).toBe(0);
  });
});
