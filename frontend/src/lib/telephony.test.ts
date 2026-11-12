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

import { DEFAULT_PREFS, buildCsv, sanitizePrefs, type TelephonyStats } from "./telephony";

describe("page settings", () => {
  it("falls back to the defaults for nothing, or for rubbish", () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs("x")).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({ direction: "sideways", minSeconds: "abc", top: "lots", autoMinutes: 7, range: "all" })).toEqual(DEFAULT_PREFS);
  });

  it("keeps good values, clamps big ones and orders the working hours", () => {
    const p = sanitizePrefs({ direction: "inbound", minSeconds: 30, top: 9999, hourFrom: 18, hourTo: 9, autoMinutes: 5, show: { cost: false } });
    expect(p).toMatchObject({ direction: "inbound", minSeconds: 30, top: 50, hourFrom: 9, hourTo: 18, autoMinutes: 5 });
    expect(p.show).toEqual({ cost: false, direction: true, hours: true, outcomes: true, numbers: true });
  });

  it("only accepts real dates for a custom range", () => {
    expect(sanitizePrefs({ range: "custom", from: "2026-11-01", to: "tomorrow" })).toMatchObject({ range: "custom", from: "2026-11-01", to: "" });
  });
});

describe("csv export", () => {
  it("writes the summary, the series and the numbers, and quotes safely", () => {
    const d = {
      totals: { calls: 2, answered: 1, unanswered: 1, answerRate: 50, totalSeconds: 60, avgSeconds: 60, cost: 1.5 },
      grain: "day",
      series: [{ key: "2026-11-09", label: "09 Nov", calls: 2, answered: 1 }],
      topNumbers: [{ number: '91"98', calls: 2, answered: 1, seconds: 60 }],
    } as unknown as TelephonyStats;
    const csv = buildCsv(d);
    expect(csv).toContain('"Pick-up rate %","50"');
    expect(csv).toContain('"2026-11-09","2","1"');
    expect(csv).toContain('"91""98","2","1","60"');
  });
});
