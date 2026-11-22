import { describe, expect, it } from "vitest";
import { COLUMN_SORTS, DEFAULT_LEAD_SORT, LEAD_SORTS, columnDirection, nextColumnSort, sortParam } from "./lead-sort";

describe("lead list order choices", () => {
  it("starts on priority, which is what the list always did", () => {
    expect(DEFAULT_LEAD_SORT).toBe("priority");
    expect(LEAD_SORTS[0].value).toBe("priority");
  });

  it("sends nothing for the default and the choice for anything else", () => {
    expect(sortParam("priority")).toBeUndefined();
    expect(sortParam("number_old")).toBe("number_old");
  });

  it("offers each order once, with a label", () => {
    expect(new Set(LEAD_SORTS.map((s) => s.value)).size).toBe(LEAD_SORTS.length);
    expect(LEAD_SORTS.every((s) => s.label.length > 3)).toBe(true);
  });

  it("gives every column heading two orders that exist in the list", () => {
    const values = LEAD_SORTS.map((o) => o.value as string);
    for (const [column, pair] of Object.entries(COLUMN_SORTS)) {
      expect(values, column).toContain(pair[0]);
      expect(values, column).toContain(pair[1]);
    }
  });

  it("goes one way, the other way, then back to the usual order on repeated clicks", () => {
    expect(nextColumnSort("owner", "priority")).toBe("owner_az");
    expect(nextColumnSort("owner", "owner_az")).toBe("owner_za");
    expect(nextColumnSort("owner", "owner_za")).toBe(DEFAULT_LEAD_SORT);
    expect(columnDirection("owner", "owner_za")).toBe("second");
    expect(columnDirection("owner", "priority")).toBeNull();
  });
});
