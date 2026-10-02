import { emptyCohort, funnelOf, mergeSpend, sortRows, totalOf, withMetrics, type CohortRow } from "./metrics";

const row = (over: Partial<CohortRow>): CohortRow => ({ ...emptyCohort(over.key ?? "g", over.channel ?? "Google Search Ads", null), ...over });

describe("withMetrics", () => {
  it("works out cost per stage and the rates", () => {
    const m = withMetrics(row({ leads: 50, qualified: 20, applications: 10, sanctioned: 6, disbursed: 4, commission: 80_000 }), 25_000);
    expect(m.costPerLead).toBe(500);
    expect(m.costPerQualified).toBe(1250);
    expect(m.costPerApplication).toBe(2500);
    expect(m.costPerDisbursal).toBe(6250);
    expect(m.qualifiedRate).toBe(40);
    expect(m.applicationRate).toBe(20);
    expect(m.disbursalRate).toBe(8);
    expect(m.returnOnSpend).toBe(3.2);
  });

  it("never divides by zero: an empty stage has no cost, and no spend means no return figure", () => {
    const m = withMetrics(row({ leads: 10, qualified: 0 }), 5000);
    expect(m.costPerLead).toBe(500);
    expect(m.costPerQualified).toBeNull();
    expect(m.costPerDisbursal).toBeNull();
    const free = withMetrics(row({ leads: 10, commission: 1000 }), 0);
    expect(free.costPerLead).toBe(0);
    expect(free.returnOnSpend).toBeNull();
    expect(withMetrics(row({}), 0).qualifiedRate).toBeNull();
  });
});

describe("mergeSpend", () => {
  it("adds spend to the matching row and keeps rows that spent nothing", () => {
    const rows = mergeSpend(
      [row({ key: "A", leads: 10 }), row({ key: "B", channel: "Referral", leads: 5 })],
      [{ key: "A", channel: "Google Search Ads", campaign: null, spend: 3000 }, { key: "A", channel: "Google Search Ads", campaign: null, spend: 2000 }],
    );
    expect(rows.find((r) => r.key === "A")?.spend).toBe(5000);
    expect(rows.find((r) => r.key === "A")?.costPerLead).toBe(500);
    expect(rows.find((r) => r.key === "B")?.spend).toBe(0);
  });

  it("shows spend that produced no leads at all, as its own row", () => {
    const rows = mergeSpend([row({ key: "A", leads: 10 })], [{ key: "Hoardings", channel: "Hoardings", campaign: null, spend: 40_000 }]);
    const h = rows.find((r) => r.key === "Hoardings")!;
    expect(h).toMatchObject({ leads: 0, spend: 40_000, costPerLead: null, channel: "Hoardings" });
  });
});

describe("totals and funnel", () => {
  const rows = mergeSpend(
    [row({ key: "A", leads: 40, qualified: 16, applications: 8, sanctioned: 4, disbursed: 2, disbursedAmount: 2_000_000, commission: 30_000 }), row({ key: "B", leads: 10, qualified: 4, applications: 2, sanctioned: 1, disbursed: 1, disbursedAmount: 500_000, commission: 10_000 })],
    [{ key: "A", channel: null, campaign: null, spend: 20_000 }, { key: "B", channel: null, campaign: null, spend: 5_000 }],
  );

  it("adds up and recomputes the ratios from the totals, not by averaging averages", () => {
    const t = totalOf(rows);
    expect(t).toMatchObject({ leads: 50, qualified: 20, applications: 10, disbursed: 3, disbursedAmount: 2_500_000, spend: 25_000 });
    expect(t.costPerLead).toBe(500);
    expect(t.costPerDisbursal).toBe(8333.33);
    expect(t.returnOnSpend).toBe(1.6);
  });

  it("describes the funnel as shares of the first stage and of the stage before", () => {
    const f = funnelOf(totalOf(rows));
    expect(f.map((s) => s.stage)).toEqual(["Leads", "Qualified", "Applications", "Sanctioned", "Disbursed"]);
    expect(f.map((s) => s.count)).toEqual([50, 20, 10, 5, 3]);
    expect(f[1]).toMatchObject({ ofLeads: 40, ofPrevious: 40 });
    expect(f[4]).toMatchObject({ ofLeads: 6, ofPrevious: 60 });
    expect(f[0].ofPrevious).toBeNull();
  });

  it("copes with an empty period", () => {
    const f = funnelOf(emptyCohort("x", null, null));
    expect(f.every((s) => s.count === 0 && s.ofLeads === null)).toBe(true);
    expect(totalOf([]).leads).toBe(0);
  });

  it("lists the busiest first, then the biggest spenders", () => {
    const sorted = sortRows(mergeSpend([row({ key: "small", leads: 2 }), row({ key: "big", leads: 20 })], [{ key: "silent", channel: null, campaign: null, spend: 9_000 }, { key: "quiet", channel: null, campaign: null, spend: 100 }]));
    expect(sorted.map((r) => r.key)).toEqual(["big", "small", "silent", "quiet"]);
  });
});
