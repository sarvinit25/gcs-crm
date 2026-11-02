import {
  bucketMonths,
  commissionBuckets,
  currentMonthRange,
  lastMonths,
  loanTypeBreakdown,
  monthKey,
  monthSpan,
  monthsInRange,
  stageBreakdown,
  type Item,
} from "./report-aggregate";
import { KINDS, callbackStage, isReportKind, rejectStage, REPORT_KINDS } from "./report-kinds";

const at = (iso: string) => new Date(iso);
const item = (over: Partial<Item>): Item => ({ at: at("2026-11-02T06:00:00Z"), stage: "NEW", loanType: "Home Loan", amount: 100, ...over });

describe("months", () => {
  it("uses India calendar months, not UTC", () => {
    // 20:00 UTC on 31 Oct is already 1 Nov in Mumbai.
    expect(monthKey(at("2026-10-31T20:00:00Z"))).toBe("2026-11");
    expect(monthKey(at("2026-10-31T10:00:00Z"))).toBe("2026-10");
  });

  it("lists the last six months oldest first, across a year boundary and with no fixed year", () => {
    expect(lastMonths(6, at("2027-02-10T06:00:00Z")).map((m) => m.month)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(lastMonths(1, at("2041-07-01T00:00:00Z"))[0]).toEqual({ month: "2041-07", label: "Jul 2041" });
  });

  it("spans every month a window touches, defaulting to twelve and capping very long windows", () => {
    const now = at("2026-11-02T06:00:00Z");
    expect(monthsInRange({}, now)).toHaveLength(12);
    expect(monthsInRange({}, now).at(-1)!.month).toBe("2026-11");
    const fy = monthsInRange({ from: at("2026-03-31T18:30:00Z"), to: at("2027-03-31T18:29:59Z") }, at("2027-06-01T00:00:00Z"));
    expect(fy.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
    expect(monthsInRange({ from: at("2000-01-01T00:00:00Z") }, now)).toHaveLength(36);
    // A window that ends in the future stops at the current month.
    expect(monthsInRange({ from: at("2026-10-01T00:00:00Z"), to: at("2027-12-31T00:00:00Z") }, now).at(-1)!.month).toBe("2026-11");
  });

  it("bounds a month list from its first India day to its last", () => {
    const span = monthSpan(lastMonths(1, at("2026-02-10T06:00:00Z")));
    expect(span.from!.toISOString()).toBe("2026-01-31T18:30:00.000Z");
    expect(span.to!.toISOString()).toBe("2026-02-28T18:29:59.999Z");
    expect(currentMonthRange(at("2028-02-10T06:00:00Z")).to!.toISOString()).toBe("2028-02-29T18:29:59.999Z");
  });

  it("buckets counts and sums, ignoring anything outside the window", () => {
    const slots = lastMonths(2, at("2026-11-02T06:00:00Z"));
    const points = bucketMonths(
      [
        { at: at("2026-10-15T00:00:00Z"), amount: 5 },
        { at: at("2026-11-01T00:00:00Z"), amount: 7 },
        { at: at("2026-11-02T00:00:00Z"), amount: 3 },
        { at: at("2025-01-01T00:00:00Z"), amount: 99 },
      ],
      slots,
    );
    expect(points.map((p) => [p.month, p.count, p.amount])).toEqual([
      ["2026-10", 1, 5],
      ["2026-11", 2, 10],
    ]);
  });
});

describe("stage and loan-type breakdowns", () => {
  it("keeps the defined order, shows empty stages, and appends stages it did not expect", () => {
    const rows = stageBreakdown(
      [item({ stage: "B", amount: 10 }), item({ stage: "B", amount: 5 }), item({ stage: "SURPRISE_STAGE" })],
      [
        { key: "A", label: "Alpha" },
        { key: "B", label: "Bravo" },
      ],
    );
    expect(rows.map((r) => [r.label, r.count, r.amount])).toEqual([
      ["Alpha", 0, 0],
      ["Bravo", 2, 15],
      ["Surprise stage", 1, 100],
    ]);
  });

  it("shares loan types out so the percentages describe the records", () => {
    const rows = loanTypeBreakdown([
      item({ loanType: "Home Loan", amount: 10 }),
      item({ loanType: "Home Loan", amount: 20 }),
      item({ loanType: "Business Loan", amount: 5 }),
      item({ loanType: "Car Loan", amount: 1 }),
    ]);
    expect(rows[0]).toEqual({ name: "Home Loan", count: 2, amount: 30, percent: 50 });
    expect(rows.map((r) => r.name)).toEqual(["Home Loan", "Business Loan", "Car Loan"]);
    expect(rows.reduce((s, r) => s + r.percent, 0)).toBe(100);
    expect(loanTypeBreakdown([])).toEqual([]);
  });
});

describe("commission buckets", () => {
  it("splits a book into due, claimed and received", () => {
    const b = commissionBuckets([
      { stage: "PENDING", amount: 1000 },
      { stage: "CLAIMED", amount: 2000 },
      { stage: "PARTIAL", amount: 3000, received: 1000 },
      { stage: "PAID", amount: 4000, received: 4000 },
      { stage: "PAID", amount: 500 },
    ]);
    expect(b).toEqual({ due: 1000, claimed: 4000, received: 5500, total: 10500 });
  });
});

describe("report kinds", () => {
  it("defines the eight reports of the hub, and only commissions is commission-only", () => {
    expect([...REPORT_KINDS]).toEqual(["leads", "callbacks", "files", "login-files", "sanctions", "disbursals", "rejects", "commissions"]);
    expect(REPORT_KINDS.filter((k) => KINDS[k].commission)).toEqual(["commissions"]);
    expect(isReportKind("files")).toBe(true);
    expect(isReportKind("../etc")).toBe(false);
  });

  it("gives every report three or four headline tiles", () => {
    for (const k of REPORT_KINDS) {
      const tiles = KINDS[k].tiles([], at("2026-11-02T06:00:00Z"));
      expect(tiles.length).toBeGreaterThanOrEqual(3);
      expect(tiles.length).toBeLessThanOrEqual(4);
    }
  });

  it("counts files tiles: total, active, this month, rejected", () => {
    const now = at("2026-11-10T06:00:00Z");
    const tiles = KINDS.files.tiles(
      [
        item({ stage: "SUBMITTED", at: at("2026-11-02T06:00:00Z") }),
        item({ stage: "DISBURSED", at: at("2026-09-02T06:00:00Z") }),
        item({ stage: "REJECTED", at: at("2026-09-02T06:00:00Z") }),
        item({ stage: "SANCTIONED", at: at("2026-10-31T20:00:00Z") }),
      ],
      now,
    );
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ["Total files", 4],
      ["Active", 2],
      ["This month", 2],
      ["Rejected", 1],
    ]);
  });

  it("classifies rejects and callbacks", () => {
    expect(rejectStage({ bankLoginAt: null, sanctionFinancialStatus: null })).toBe("BEFORE_LOGIN");
    expect(rejectStage({ bankLoginAt: new Date(), sanctionFinancialStatus: null })).toBe("AFTER_LOGIN");
    expect(rejectStage({ bankLoginAt: new Date(), sanctionFinancialStatus: "REJECTED" })).toBe("SANCTION_REJECTED");
    const now = at("2026-11-02T06:00:00Z");
    expect(callbackStage({ doneAt: now, dueAt: null }, now)).toBe("DONE");
    expect(callbackStage({ doneAt: null, dueAt: at("2026-11-01T00:00:00Z") }, now)).toBe("OVERDUE");
    expect(callbackStage({ doneAt: null, dueAt: at("2026-11-03T00:00:00Z") }, now)).toBe("PENDING");
    expect(callbackStage({ doneAt: null, dueAt: null }, now)).toBe("PENDING");
  });
});
