import { describe, expect, it } from "vitest";
import { leadsLink, parseLeadSearch } from "./lead-filters";

describe("opening the Leads page from a link", () => {
  it("keeps the filters it understands", () => {
    expect(parseLeadSearch({ status: "NEW", segment: "HOT", source: "whatsapp", dueOnly: true, owner: "none" })).toEqual({
      status: "NEW", segment: "HOT", source: "whatsapp", dueOnly: true, owner: "none",
    });
  });

  it("drops anything unknown, wrong or empty", () => {
    expect(parseLeadSearch({ status: "BOGUS", segment: "LUKEWARM", source: "  ", dueOnly: "yes", owner: "x".repeat(41), extra: "1" })).toEqual({});
    expect(parseLeadSearch({})).toEqual({});
    expect(parseLeadSearch({ status: 5, source: 7 })).toEqual({});
  });

  it("reads the due-only flag whether the address gave it as true or as text", () => {
    expect(parseLeadSearch({ dueOnly: true })).toEqual({ dueOnly: true });
    expect(parseLeadSearch({ dueOnly: "true" })).toEqual({ dueOnly: true });
    expect(parseLeadSearch({ dueOnly: false })).toEqual({});
  });

  it("can open the archived section, and ignores any other view", () => {
    expect(parseLeadSearch({ view: "archived" })).toEqual({ view: "archived" });
    expect(parseLeadSearch({ view: "trash" })).toEqual({});
  });

  it("builds a link to the Leads page", () => {
    expect(leadsLink({ segment: "HOT" })).toEqual({ to: "/leads", search: { segment: "HOT" } });
    expect(leadsLink()).toEqual({ to: "/leads", search: {} });
    expect(leadsLink({ dueOnly: true, owner: "none" }).search).toEqual({ dueOnly: true, owner: "none" });
  });
});
