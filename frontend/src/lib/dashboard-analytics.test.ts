import { describe, expect, it } from "vitest";
import { STAGE_META, formName, openLeads, priorityBars, stageShares, type Analytics } from "./dashboard-analytics";

const mix: Analytics["leads"]["priority"] = { HOT: 4, WARM: 3, FOLLOW_UP: 2, COLD: 1, NONE: 5 };

describe("dashboard analytics helpers", () => {
  it("lists priority from Hot to Cold, each with its own colour and a label", () => {
    const bars = priorityBars(mix);
    expect(bars.map((b) => [b.label, b.value])).toEqual([["Hot", 4], ["Warm", 3], ["Follow-up", 2], ["Cold", 1]]);
    expect(new Set(bars.map((b) => b.color)).size).toBe(4);
  });

  it("counts every open lead, including those with no priority", () => {
    expect(openLeads(mix)).toBe(15);
  });

  it("names a website form in words", () => {
    expect(formName("ca-legal-enquiry")).toBe("CA & Legal enquiry");
    expect(formName("loan-page_form-2")).toBe("Loan page form 2");
    expect(formName("")).toBe("Unknown form");
  });
});

describe("lead pipeline shares", () => {
  it("lists every stage in order with its count and share", () => {
    const rows = stageShares({ NEW: 15, CONVERTED: 5 }, 20);
    expect(rows.map((r) => r.key)).toEqual(STAGE_META.map((m) => m.key));
    expect(rows[0]).toMatchObject({ label: "New", count: 15, percent: 75 });
    expect(rows[4]).toMatchObject({ label: "Converted", count: 5, percent: 25 });
    expect(rows[1]).toMatchObject({ count: 0, percent: 0, width: 0 });
  });

  it("keeps a small stage visible on the bar, but draws nothing for an empty one", () => {
    const rows = stageShares({ NEW: 199, LOST: 1 }, 200);
    expect(rows[5]!.width).toBe(2);
    expect(rows[5]!.percent).toBe(1);
    expect(rows[2]!.width).toBe(0);
  });

  it("copes with no leads at all", () => {
    expect(stageShares({}, 0).every((r) => r.count === 0 && r.percent === 0 && r.width === 0)).toBe(true);
  });

  it("gives each stage its own colour", () => {
    expect(new Set(STAGE_META.map((m) => m.color)).size).toBe(STAGE_META.length);
  });
});
