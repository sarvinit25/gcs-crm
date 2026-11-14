import { describe, expect, it } from "vitest";
import { formatDuration, hourLabel, seriesTick } from "./telephony";

describe("telephony display", () => {
  it("writes talk time in the shortest readable form", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(75)).toBe("1m 15s");
    expect(formatDuration(4320)).toBe("1h 12m");
  });

  it("writes hours on a 12-hour clock", () => {
    expect([0, 9, 12, 13, 23].map(hourLabel)).toEqual(["12 am", "9 am", "12 pm", "1 pm", "11 pm"]);
  });

  it("labels day columns with the month only where it helps", () => {
    expect(seriesTick("2026-11-09", 0)).toBe("9 Nov");
    expect(seriesTick("2026-11-10", 1)).toBe("10");
    expect(seriesTick("2026-12-01", 5)).toBe("1 Dec");
    expect(seriesTick("2026-11", 1)).toBe("Nov");
    expect(seriesTick("2027-01", 2)).toBe("Jan 27");
  });
});
