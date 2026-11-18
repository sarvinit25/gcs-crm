import { describe, expect, it } from "vitest";
import { formName, openLeads, priorityBars, type Analytics } from "./dashboard-analytics";

const mix: Analytics["leads"]["priority"] = { HOT: 4, WARM: 3, FOLLOW_UP: 2, COLD: 1, NONE: 5 };

describe("dashboard analytics helpers", () => {
  it("lists priority from Hot to Cold, each with its own colour and a label", () => {
    const bars = priorityBars(mix);
    expect(bars.map((b) => [b.label, b.value])).toEqual([["Hot", 4], ["Warm", 3], ["Follow-up", 2], ["Cold", 1]]);
    expect(new Set(bars.map((b) => b.color)).size).toBe(4);
  });

  it("counts every open lead, including those with no priority", () => {
    expect(openLeads(mix)).toBe(15);
  });

  it("names a website form in words", () => {
    expect(formName("ca-legal-enquiry")).toBe("CA & Legal enquiry");
    expect(formName("loan-page_form-2")).toBe("Loan page form 2");
    expect(formName("")).toBe("Unknown form");
  });
});
