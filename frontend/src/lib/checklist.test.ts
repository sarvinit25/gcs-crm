import { describe, expect, it } from "vitest";
import { groupChecklist, withMark } from "./checklist";
import type { ApplicationChecklist } from "./types";

const item = (id: string, category: string, status: "GIVEN" | "PENDING") => ({ id, label: id, description: null, category, status });
const list = (items: ApplicationChecklist["items"]): ApplicationChecklist => ({ bucket: null, items, total: items.length, given: items.filter((i) => i.status === "GIVEN").length });

describe("groupChecklist", () => {
  it("keeps categories in the order they first appear", () => {
    const g = groupChecklist([item("a", "KYC", "PENDING"), item("b", "PROPERTY", "PENDING"), item("c", "KYC", "PENDING")]);
    expect(g.map(([c]) => c)).toEqual(["KYC", "PROPERTY"]);
  });
  it("puts received lines below the ones still to collect, inside each category only", () => {
    const g = groupChecklist([
      item("pan", "KYC", "GIVEN"),
      item("aadhaar", "KYC", "PENDING"),
      item("photo", "KYC", "PENDING"),
      item("title", "PROPERTY", "PENDING"),
      item("plan", "PROPERTY", "GIVEN"),
    ]);
    expect(g[0][1].map((i) => i.id)).toEqual(["aadhaar", "photo", "pan"]);
    expect(g[1][1].map((i) => i.id)).toEqual(["title", "plan"]);
  });
  it("keeps the original order among lines of the same kind", () => {
    const g = groupChecklist([item("a", "K", "GIVEN"), item("b", "K", "GIVEN"), item("c", "K", "PENDING"), item("d", "K", "PENDING")]);
    expect(g[0][1].map((i) => i.id)).toEqual(["c", "d", "a", "b"]);
  });
  it("does not change the list it was given", () => {
    const input = [item("a", "K", "GIVEN"), item("b", "K", "PENDING")];
    groupChecklist(input);
    expect(input.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("withMark", () => {
  it("ticks one line and recounts", () => {
    const out = withMark(list([item("a", "K", "PENDING"), item("b", "K", "PENDING")]), "a", true);
    expect(out.items.map((i) => i.status)).toEqual(["GIVEN", "PENDING"]);
    expect(out.given).toBe(1);
    expect(out.total).toBe(2);
  });
  it("un-ticks a received line", () => {
    const out = withMark(list([item("a", "K", "GIVEN"), item("b", "K", "GIVEN")]), "b", false);
    expect(out.items.map((i) => i.status)).toEqual(["GIVEN", "PENDING"]);
    expect(out.given).toBe(1);
  });
  it("leaves everything alone for an unknown line", () => {
    const before = list([item("a", "K", "PENDING")]);
    expect(withMark(before, "zzz", true)).toEqual(before);
  });
});
