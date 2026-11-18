import { archivedByMap, averageDays, daysInPipeline, lostReasons } from "./archive-view";

const d = (iso: string) => new Date(iso);

describe("archived leads: days in the pipeline", () => {
  it("counts whole days from entry to archive", () => {
    expect(daysInPipeline(d("2026-11-01T10:00:00Z"), d("2026-11-11T09:00:00Z"))).toBe(9);
    expect(daysInPipeline(d("2026-11-01T10:00:00Z"), d("2026-11-01T20:00:00Z"))).toBe(0);
    expect(daysInPipeline(d("2026-11-05T10:00:00Z"), d("2026-11-01T10:00:00Z"))).toBe(0);
  });

  it("averages over the archived ones and ignores the rest", () => {
    expect(averageDays([])).toBe(0);
    expect(
      averageDays([
        { createdAt: d("2026-11-01T00:00:00Z"), archivedAt: d("2026-11-11T00:00:00Z") },
        { createdAt: d("2026-11-01T00:00:00Z"), archivedAt: d("2026-11-21T00:00:00Z") },
        { createdAt: d("2026-11-01T00:00:00Z"), archivedAt: null },
      ]),
    ).toBe(15);
  });
});

describe("archived leads: who archived", () => {
  it("credits the most recent archiver of each lead", () => {
    const m = archivedByMap([
      { entityId: "a", actorName: "Asha", createdAt: d("2026-11-01T00:00:00Z") },
      { entityId: "a", actorName: "Bala", createdAt: d("2026-11-09T00:00:00Z") },
      { entityId: "b", actorName: "Chitra", createdAt: d("2026-11-02T00:00:00Z") },
    ]);
    expect(m.get("a")).toBe("Bala");
    expect(m.get("b")).toBe("Chitra");
    expect(m.get("zzz")).toBeUndefined();
  });
});

describe("archived leads: lost reasons", () => {
  it("ranks the reasons and names the missing ones", () => {
    const r = lostReasons([
      { lostReason: "Not interested" },
      { lostReason: " Not interested " },
      { lostReason: "Got a loan elsewhere" },
      { lostReason: null },
      { lostReason: "" },
    ]);
    expect(r).toEqual([
      { reason: "No reason recorded", count: 2 },
      { reason: "Not interested", count: 2 },
      { reason: "Got a loan elsewhere", count: 1 },
    ]);
  });

  it("keeps only the top few", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ lostReason: `r${i}` }));
    expect(lostReasons(rows, 4)).toHaveLength(4);
  });
});
