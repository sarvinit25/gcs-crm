import { LEAD_SORTS, leadOrderBy } from "./lead-sort";

describe("lead list order", () => {
  it("keeps the usual priority order when nothing is chosen", () => {
    expect(leadOrderBy(undefined)).toEqual(leadOrderBy("priority"));
    expect(leadOrderBy("priority")).toEqual([
      { segment: { sort: "asc", nulls: "last" } },
      { nextFollowUpAt: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
      { leadNo: "desc" },
    ]);
  });

  it("puts Cold first, and leads with no priority last, when asked for cold to hot", () => {
    expect(leadOrderBy("priority_cold")[0]).toEqual({ segment: { sort: "desc", nulls: "last" } });
  });

  it("orders by lead number, newest or oldest first", () => {
    expect(leadOrderBy("number_new")).toEqual([{ leadNo: "desc" }]);
    expect(leadOrderBy("number_old")).toEqual([{ leadNo: "asc" }]);
  });

  it("puts the soonest follow-up first, and the biggest amount first, with blanks last", () => {
    expect(leadOrderBy("followup")[0]).toEqual({ nextFollowUpAt: { sort: "asc", nulls: "last" } });
    expect(leadOrderBy("amount")[0]).toEqual({ amount: { sort: "desc", nulls: "last" } });
  });

  it("always ends on the unique lead number, so pages never shuffle", () => {
    for (const s of LEAD_SORTS) {
      const order = leadOrderBy(s);
      expect(Object.keys(order[order.length - 1]!)).toEqual(["leadNo"]);
    }
  });
});
