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

  it("sorts every column both ways, (a blank owner or reference sorts last A to Z and first Z to A)", () => {
    expect(leadOrderBy("name_az")[0]).toEqual({ name: "asc" });
    expect(leadOrderBy("name_za")[0]).toEqual({ name: "desc" });
    expect(leadOrderBy("product_az")[0]).toEqual({ loanProduct: { name: "asc" } });
    expect(leadOrderBy("owner_az")[0]).toEqual({ assignedOfficer: { name: "asc" } });
    expect(leadOrderBy("owner_za")[0]).toEqual({ assignedOfficer: { name: "desc" } });
    expect(leadOrderBy("reference_za")[0]).toEqual({ sourcingPartner: { name: "desc" } });
    expect(leadOrderBy("amount_low")[0]).toEqual({ amount: { sort: "asc", nulls: "last" } });
    expect(leadOrderBy("followup_late")[0]).toEqual({ nextFollowUpAt: { sort: "desc", nulls: "last" } });
    expect(leadOrderBy("contacts_most")[0]).toEqual({ followUps: { _count: "desc" } });
    expect(leadOrderBy("status_flow")[0]).toEqual({ status: "asc" });
  });
});
