import {
  describeRange,
  formatDateIST,
  formatDateTimeIST,
  formatIndianNumber,
  fyLabel,
  fyStartYear,
  istParts,
  istToday,
  parseYmd,
  periodRange,
  resolveRange,
  PERIODS,
} from "./date.util";

const at = (iso: string) => new Date(iso);
/** Show an instant as the India wall-clock date/time it represents. */
const ist = (d?: Date) => (d ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ") : undefined);

describe("India calendar day", () => {
  it("rolls to the next day at 18:30 UTC, not at UTC midnight", () => {
    expect(istToday(at("2026-09-29T18:29:00Z"))).toBe("2026-09-29");
    expect(istToday(at("2026-09-29T18:30:00Z"))).toBe("2026-09-30");
  });

  it("handles the new year and leap days", () => {
    expect(istParts(at("2026-12-31T19:00:00Z"))).toEqual({ year: 2027, month: 1, day: 1 });
    expect(istToday(at("2028-02-28T19:00:00Z"))).toBe("2028-02-29");
  });

  it("parses only real calendar dates", () => {
    expect(parseYmd("2026-02-28")).toEqual({ year: 2026, month: 2, day: 28 });
    expect(parseYmd("2026-02-30")).toBeNull();
    expect(parseYmd("29/09/2026")).toBeNull();
  });
});

describe("financial year (April to March)", () => {
  it("starts on 1 April", () => {
    expect(fyStartYear({ year: 2026, month: 3, day: 31 })).toBe(2025);
    expect(fyStartYear({ year: 2026, month: 4, day: 1 })).toBe(2026);
  });

  it("labels as 2026-27, including the century rollover", () => {
    expect(fyLabel(2026)).toBe("2026-27");
    expect(fyLabel(2099)).toBe("2099-00");
    expect(fyLabel(2100)).toBe("2100-01");
  });
});

describe("periodRange", () => {
  const now = at("2026-09-30T03:47:00+05:30");

  it.each([
    ["today", "2026-09-30 00:00", "2026-09-30 23:59"],
    ["yesterday", "2026-09-29 00:00", "2026-09-29 23:59"],
    ["7d", "2026-09-24 00:00", "2026-09-30 23:59"],
    ["month", "2026-09-01 00:00", "2026-09-30 23:59"],
    ["last_month", "2026-08-01 00:00", "2026-08-31 23:59"],
    ["quarter", "2026-07-01 00:00", "2026-09-30 23:59"],
    ["fy", "2026-04-01 00:00", "2027-03-31 23:59"],
    ["last_fy", "2025-04-01 00:00", "2026-03-31 23:59"],
    ["year", "2026-01-01 00:00", "2026-12-31 23:59"],
  ] as const)("%s", (period, from, to) => {
    const r = periodRange(period, now);
    expect(ist(r.from)).toBe(from);
    expect(ist(r.to)).toBe(to);
  });

  it("puts January in the Jan–Mar quarter and last month in December", () => {
    const jan = at("2027-01-15T12:00:00+05:30");
    expect(ist(periodRange("quarter", jan).from)).toBe("2027-01-01 00:00");
    expect(ist(periodRange("last_month", jan).from)).toBe("2026-12-01 00:00");
  });

  it("is unbounded for 'all' and never inverted for any period, decades out", () => {
    expect(periodRange("all", now)).toEqual({});
    for (const when of ["2047-02-28T12:00:00+05:30", "2100-12-31T23:59:00+05:30", "2028-02-29T10:00:00+05:30"]) {
      for (const p of PERIODS) {
        const r = periodRange(p, at(when));
        if (r.from && r.to) expect(r.from.getTime()).toBeLessThan(r.to.getTime());
      }
    }
  });
});

describe("resolveRange", () => {
  it("treats date-only input as whole India days, including the end day", () => {
    const r = resolveRange({ from: "2026-04-01", to: "2027-03-31" });
    expect(ist(r.from)).toBe("2026-04-01 00:00");
    expect(ist(r.to)).toBe("2027-03-31 23:59");
  });

  it("prefers a named period and ignores unknown ones", () => {
    const now = at("2026-09-30T10:00:00+05:30");
    expect(ist(resolveRange({ range: "fy" }, now).from)).toBe("2026-04-01 00:00");
    expect(resolveRange({ range: "bogus" })).toEqual({ from: undefined, to: undefined });
  });

  it("describes a range for report headers", () => {
    expect(describeRange({})).toBe("All time");
    expect(describeRange(resolveRange({ from: "2026-04-01", to: "2026-04-30" }))).toBe("01 Apr 2026 to 30 Apr 2026");
  });
});

describe("deterministic formatting", () => {
  it("always writes Sep, never Sept, and uses India time", () => {
    expect(formatDateIST(new Date("2026-09-29T20:00:00Z"))).toBe("30 Sep 2026");
    expect(formatDateTimeIST(new Date("2026-09-30T10:00:00Z"))).toBe("30 Sep 2026, 3:30 pm");
    expect(formatDateTimeIST(new Date("2026-09-29T18:30:00Z"))).toBe("30 Sep 2026, 12:00 am");
  });

  it("groups digits the Indian way", () => {
    expect(formatIndianNumber(0)).toBe("0");
    expect(formatIndianNumber(999)).toBe("999");
    expect(formatIndianNumber(1000)).toBe("1,000");
    expect(formatIndianNumber(123456)).toBe("1,23,456");
    expect(formatIndianNumber(12345678)).toBe("1,23,45,678");
    expect(formatIndianNumber(1234567890)).toBe("1,23,45,67,890");
    expect(formatIndianNumber(1250.5)).toBe("1,250.50");
    expect(formatIndianNumber(-50000)).toBe("-50,000");
  });
});
