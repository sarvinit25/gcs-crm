import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD_SORT, LEAD_SORTS, sortParam } from "./lead-sort";

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
});
