import { describe, expect, it } from "vitest";
import { compactCount, donutArcs, linePath, monthTick, niceScale, sharePercent, SERIES } from "./charts";

describe("niceScale", () => {
  it("rounds the top of the axis to a friendly number with even ticks from zero", () => {
    expect(niceScale(7)).toEqual({ max: 8, ticks: [0, 2, 4, 6, 8] });
    expect(niceScale(100).ticks).toEqual([0, 25, 50, 75, 100]);
    expect(niceScale(1)).toEqual({ max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] });
    expect(niceScale(930).max).toBe(1000);
  });
  it("copes with nothing to plot", () => {
    expect(niceScale(0).ticks).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("linePath", () => {
  it("joins the points, and still draws a lone one", () => {
    expect(linePath([{ x: 0, y: 10 }, { x: 5, y: 2.555 }])).toBe("M0,10L5,2.56");
    expect(linePath([{ x: 3, y: 4 }])).toContain("M3,4");
    expect(linePath([])).toBe("");
  });
});

describe("donutArcs", () => {
  it("makes one arc per non-zero value, in order, covering the whole ring", () => {
    const arcs = donutArcs([30, 0, 70], 100, 100, 80, 50, 0);
    expect(arcs.map((a) => a.index)).toEqual([0, 2]);
    expect(arcs[0].start).toBe(0);
    expect(arcs[0].end).toBeCloseTo(0.3 * Math.PI * 2, 6);
    expect(arcs[1].end).toBeCloseTo(Math.PI * 2, 6);
    expect(arcs[0].path.startsWith("M")).toBe(true);
  });
  it("leaves a seam between neighbours", () => {
    const [a, b] = donutArcs([50, 50], 100, 100, 80, 50, 0.04);
    expect(b.start - a.end).toBeCloseTo(0.04, 6);
  });
  it("draws a single value as a full ring and nothing for an empty one", () => {
    const [only] = donutArcs([9], 100, 100, 80, 50);
    expect((only.path.match(/M/g) ?? []).length).toBe(2);
    expect(donutArcs([0, 0], 100, 100, 80, 50)).toEqual([]);
  });
  it("has enough distinct series colours for every file stage", () => {
    expect(new Set(SERIES).size).toBeGreaterThanOrEqual(8);
  });
});

describe("labels", () => {
  it("formats counts compactly", () => {
    expect(compactCount(950)).toBe("950");
    expect(compactCount(12_400)).toBe("12.4k");
    expect(compactCount(2_500_000)).toBe("2.5M");
  });
  it("shows the year on the first month and every January only", () => {
    expect(monthTick("2026-11", 0)).toBe("Nov 26");
    expect(monthTick("2026-12", 1)).toBe("Dec");
    expect(monthTick("2027-01", 2)).toBe("Jan 27");
  });
  it("rounds shares sensibly", () => {
    expect(sharePercent(1, 3)).toBe("33%");
    expect(sharePercent(1, 1000)).toBe("<1%");
    expect(sharePercent(0, 10)).toBe("0%");
    expect(sharePercent(5, 0)).toBe("0%");
  });
});
