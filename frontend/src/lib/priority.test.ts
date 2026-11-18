import { describe, expect, it } from "vitest";
import { PRIORITY_META } from "./priority";
import { PRIORITY_ROWS } from "./dashboard-analytics";
import { LEAD_SEGMENTS, LEAD_SEGMENT_LABEL } from "./types";

describe("lead priority look", () => {
  it("covers every priority, in Hot to Cold order, named as everywhere else", () => {
    expect(Object.keys(PRIORITY_META)).toEqual(LEAD_SEGMENTS);
    for (const k of LEAD_SEGMENTS) expect(PRIORITY_META[k].label).toBe(LEAD_SEGMENT_LABEL[k]);
  });

  it("gives each priority its own colour and symbol", () => {
    const looks = Object.values(PRIORITY_META);
    expect(new Set(looks.map((l) => l.color)).size).toBe(4);
    expect(new Set(looks.map((l) => l.icon)).size).toBe(4);
  });

  it("is the same colours the Dashboard charts use", () => {
    for (const row of PRIORITY_ROWS) expect(row.color).toBe(PRIORITY_META[row.key].color);
  });
});
