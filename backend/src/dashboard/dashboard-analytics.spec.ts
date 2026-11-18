import { addTo, leadTrend, leaderboard, segmentMix, sourceLabel, topSources } from "./dashboard-analytics";

describe("sources", () => {
  it("tidies a source into words", () => {
    expect(sourceLabel("home-enquiry")).toBe("Home enquiry");
    expect(sourceLabel("WHATSAPP")).toBe("WhatsApp");
    expect(sourceLabel("ai-telecaller")).toBe("AI telecaller");
    expect(sourceLabel("ca-legal-enquiry")).toBe("CA legal enquiry");
    expect(sourceLabel("")).toBe("Unknown");
    expect(sourceLabel(null)).toBe("Unknown");
  });

  it("merges spellings of one source, biggest first", () => {
    const rows = topSources([
      { source: "website", count: 3 },
      { source: "Website", count: 4 },
      { source: "ca-legal-enquiry", count: 5 },
      { source: null, count: 1 },
    ]);
    expect(rows.map((r) => [r.label, r.count])).toEqual([["Website", 7], ["CA legal enquiry", 5], ["Unknown", 1]]);
  });

  it("carries the stored spelling to link with: the most common one, and none for Unknown or Other", () => {
    const rows = topSources([
      { source: "website", count: 3 },
      { source: "Website", count: 4 },
      { source: null, count: 1 },
    ]);
    expect(rows[0]!.value).toBe("Website");
    expect(rows[1]!.value).toBeUndefined();
    const many = topSources(Array.from({ length: 4 }, (_, i) => ({ source: `s${i}`, count: 4 - i })), 3);
    expect(many.at(-1)).toEqual({ key: "other", label: "Other", count: 3 });
  });

  it("folds the tail into Other when there are too many", () => {
    const rows = topSources(Array.from({ length: 12 }, (_, i) => ({ source: `s${i}`, count: 12 - i })), 5);
    expect(rows).toHaveLength(5);
    expect(rows[4]).toEqual({ key: "other", label: "Other", count: 8 + 7 + 6 + 5 + 4 + 3 + 2 + 1 });
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(78);
  });
});

describe("priority mix", () => {
  it("counts each segment and puts the rest under NONE", () => {
    expect(segmentMix([{ segment: "HOT", count: 4 }, { segment: "COLD", count: 2 }, { segment: null, count: 3 }, { segment: "WEIRD", count: 1 }])).toEqual({
      HOT: 4, WARM: 0, FOLLOW_UP: 0, COLD: 2, NONE: 4,
    });
  });
});

describe("lead trend", () => {
  const slots = [{ month: "2026-10", label: "Oct 2026" }, { month: "2026-11", label: "Nov 2026" }];
  it("counts leads per India month and how many were converted", () => {
    const t = leadTrend(
      [
        { createdAt: new Date("2026-10-31T20:00:00Z"), status: "NEW" }, // already 1 Nov in Mumbai
        { createdAt: new Date("2026-11-05T06:00:00Z"), status: "CONVERTED" },
        { createdAt: new Date("2026-10-05T06:00:00Z"), status: "LOST" },
        { createdAt: new Date("2025-01-05T06:00:00Z"), status: "NEW" }, // outside the months shown
      ],
      slots,
    );
    expect(t).toEqual([
      { ...slots[0], leads: 1, converted: 0 },
      { ...slots[1], leads: 2, converted: 1 },
    ]);
  });
});

describe("team leaderboard", () => {
  const people = [
    { id: "a", name: "Asha", role: "ADVISOR" },
    { id: "b", name: "Bala", role: "ADVISOR" },
    { id: "c", name: "Chitra", role: "MANAGER" },
  ];
  const m = (o: Record<string, number>) => new Map(Object.entries(o));

  it("ranks by disbursals, then conversions, and leaves out people with no activity", () => {
    const rows = leaderboard(people, {
      leads: m({ a: 10, b: 8 }),
      converted: m({ a: 2, b: 4 }),
      applications: m({ a: 3 }),
      followUps: m({ b: 5 }),
      disbursed: m({ a: 500000 }),
    });
    expect(rows.map((r) => r.name)).toEqual(["Asha", "Bala"]);
    expect(rows[0]).toMatchObject({ leads: 10, converted: 2, conversionPct: 20, applications: 3, disbursed: 500000 });
    expect(rows[1]).toMatchObject({ conversionPct: 50, followUps: 5 });
  });

  it("breaks ties on conversions and shows 0% for nobody's leads", () => {
    const rows = leaderboard(people, { leads: m({ a: 5, b: 5 }), converted: m({ b: 1 }), applications: m({}), followUps: m({ c: 2 }), disbursed: m({}) });
    expect(rows.map((r) => r.name)).toEqual(["Bala", "Asha", "Chitra"]);
    expect(rows[2]!.conversionPct).toBe(0);
  });

  it("adds to a running total and ignores a missing key", () => {
    const t = new Map<string, number>();
    addTo(t, "a", 2);
    addTo(t, "a", 3);
    addTo(t, null, 9);
    expect([...t]).toEqual([["a", 5]]);
  });
});
