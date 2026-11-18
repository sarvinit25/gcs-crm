import { describe, expect, it } from "vitest";
import { buildSettings, categoryList, firstProblem, serviceProblem, slugify, toLines, type CustomService } from "./ca-legal";

const svc = (over: Partial<CustomService> = {}): CustomService => ({
  slug: "rera-complaints",
  division: "Legal Services",
  category: "RERA",
  title: "RERA complaints",
  summary: "Help filing a complaint.",
  ...over,
});

describe("CA & Legal rules", () => {
  it("turns a title into a website address", () => {
    expect(slugify("Rent Agreement & NOC")).toBe("rent-agreement-and-noc");
    expect(slugify("  GST   Notice Reply!! ")).toBe("gst-notice-reply");
    expect(slugify("%%%")).toBe("");
    expect(slugify("a".repeat(120)).length).toBeLessThanOrEqual(80);
  });

  it("reads one entry per line and drops blanks", () => {
    expect(toLines("Share papers\n\n  We draft it  \n")).toEqual(["Share papers", "We draft it"]);
    expect(toLines("")).toEqual([]);
  });

  it("says in words what is missing from a service", () => {
    const built = ["income-tax-return-filing"];
    expect(serviceProblem(svc(), [], built)).toBeNull();
    expect(serviceProblem(svc({ title: " " }), [], built)).toMatch(/title/);
    expect(serviceProblem(svc({ slug: "" }), [], built)).toMatch(/address/);
    expect(serviceProblem(svc({ slug: "income-tax-return-filing" }), [], built)).toMatch(/built-in/);
    expect(serviceProblem(svc({ category: "" }), [], built)).toMatch(/category/);
    expect(serviceProblem(svc({ summary: "  " }), [], built)).toMatch(/description/);
  });

  it("spots two services with the same address, and finds the first problem", () => {
    const a = svc();
    const b = svc({ title: "Another" });
    expect(serviceProblem(a, [a, b], [])).toMatch(/Two of your services/);
    expect(firstProblem([svc(), svc({ slug: "other", title: "Other" })], [])).toBeNull();
    expect(firstProblem([svc({ summary: "" })], [])).toMatch(/description/);
  });

  it("saves nothing when nothing is set", () => {
    expect(buildSettings([], [], {})).toEqual({});
  });

  it("saves trimmed text, de-duplicates hidden services and skips empty menu lines", () => {
    const saved = buildSettings(
      [svc({ title: "  RERA complaints ", whoNeedsIt: "  Flat buyers ", process: [" Share papers ", " "], documents: [], icon: "legal" })],
      ["gst-registration", "gst-registration"],
      { RERA: " Builder disputes ", "Legal Drafting": "   " },
    );
    expect(saved).toEqual({
      custom: [{ slug: "rera-complaints", division: "Legal Services", category: "RERA", title: "RERA complaints", summary: "Help filing a complaint.", whoNeedsIt: "Flat buyers", process: ["Share papers"], icon: "legal" }],
      hidden: ["gst-registration"],
      blurbs: { RERA: "Builder disputes" },
    });
  });

  it("lists the website's categories first, then new ones from added services, once each", () => {
    const list = categoryList([svc({ category: "RERA" }), svc({ slug: "b", category: "RERA" }), svc({ slug: "c", category: "Legal Drafting" })]);
    expect(list.slice(0, 10).every((c) => !c.added)).toBe(true);
    expect(list.filter((c) => c.added).map((c) => c.category)).toEqual(["RERA"]);
    expect(list).toHaveLength(11);
  });
});
