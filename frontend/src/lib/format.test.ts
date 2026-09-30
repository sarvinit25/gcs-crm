import { describe, expect, it } from "vitest";
import { formatAmount, formatCompact, formatDate, formatDateTime, formatIndianNumber, humanize, humanizeKey } from "./format";
import { formatTimeIST, isFutureDay, todayIST } from "./date";

describe("money", () => {
  it("groups in lakhs and crores", () => {
    expect(formatIndianNumber(1234567)).toBe("12,34,567");
    expect(formatAmount(5200000)).toBe("₹52,00,000");
    expect(formatAmount("45000")).toBe("₹45,000");
    expect(formatAmount(null)).toBe("—");
    expect(formatAmount("")).toBe("—");
  });

  it("abbreviates large amounts for tight spaces", () => {
    expect(formatCompact(5200000)).toBe("₹52 L");
    expect(formatCompact(45000000)).toBe("₹4.5 Cr");
    expect(formatCompact(49500)).toBe("₹49,500");
  });
});

describe("dates are India time and never locale-dependent", () => {
  it("formats an instant as the India calendar day", () => {
    expect(formatDate("2026-09-29T20:00:00Z")).toBe("30 Sep 2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime("2026-09-30T10:00:00Z")).toBe("30 Sep 2026, 3:30 pm");
    expect(formatTimeIST(new Date("2026-09-29T18:30:00Z"))).toBe("12:00 am");
  });

  it("decides 'today' by India time", () => {
    expect(todayIST(new Date("2026-09-29T18:29:00Z"))).toBe("2026-09-29");
    expect(todayIST(new Date("2026-09-29T18:30:00Z"))).toBe("2026-09-30");
    expect(isFutureDay("2999-01-01")).toBe(true);
    expect(isFutureDay("2000-01-01")).toBe(false);
  });
});

describe("readable labels", () => {
  it("turns codes into words", () => {
    expect(humanize("BANK_LOGIN")).toBe("Bank login");
    expect(humanize("website-enquiry")).toBe("Website enquiry");
    expect(humanize(null)).toBe("—");
    expect(humanizeKey("commissionPercent")).toBe("Commission percent");
    expect(humanizeKey("SourcingPartner")).toBe("Sourcing partner");
  });
});
