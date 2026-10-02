import { describe, expect, it } from "vitest";
import { TRACKING_PRESETS, buildTrackingLink, monthLabel, percent, rupees } from "./marketing";

describe("buildTrackingLink", () => {
  const google = TRACKING_PRESETS[0];

  it("adds the tags to the page, keeping what is already in the link", () => {
    const url = new URL(buildTrackingLink("https://growthcapitalservices.in/lp/business-loan?ref=card", google, "Business Loan Oct 2026", "Headline A")!);
    expect(url.pathname).toBe("/lp/business-loan");
    expect(Object.fromEntries(url.searchParams)).toEqual({ ref: "card", utm_source: "google", utm_medium: "cpc", utm_campaign: "business-loan-oct-2026", utm_content: "headline-a" });
  });

  it("accepts a bare domain, leaves out empty tags, and overwrites stale ones", () => {
    const url = new URL(buildTrackingLink("growthcapitalservices.in", google, "")!);
    expect(url.protocol).toBe("https:");
    expect(url.searchParams.has("utm_campaign")).toBe(false);
    const again = new URL(buildTrackingLink("https://x.in/?utm_source=old", TRACKING_PRESETS[3], "c")!);
    expect(again.searchParams.getAll("utm_source")).toEqual(["facebook"]);
  });

  it("refuses something that is not a web address", () => {
    expect(buildTrackingLink("", google, "c")).toBeNull();
    expect(buildTrackingLink("not a url", google, "c")).toBeNull();
    expect(buildTrackingLink("localhost", google, "c")).toBeNull();
  });
});

describe("TRACKING_PRESETS", () => {
  it("has a distinct source and medium pair per channel, none of them blank", () => {
    const pairs = TRACKING_PRESETS.map((p) => `${p.source}/${p.medium}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const p of TRACKING_PRESETS) expect(p.source && p.medium && p.channel).toBeTruthy();
  });
});

describe("formatting", () => {
  it("writes rupees in Indian grouping and dashes for missing numbers", () => {
    expect(rupees(1234567)).toBe("₹12,34,567");
    expect(rupees(999.6)).toBe("₹1,000");
    expect(rupees(0)).toBe("₹0");
    expect(rupees(null)).toBe("—");
    expect(percent(42.5)).toBe("42.5%");
    expect(percent(null)).toBe("—");
  });

  it("names months the same on every machine", () => {
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(monthLabel("2020-01")).toBe("Jan 2020");
    expect(monthLabel("not-a-month")).toBe("not-a-month");
  });
});
