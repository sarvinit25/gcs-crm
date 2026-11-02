import { describe, expect, it } from "vitest";
import { extractVariables, formatPhone, renderPreview, windowLeft } from "./whatsapp";

describe("template wording", () => {
  it("finds placeholders in order, once each", () => {
    expect(extractVariables("Hi {{name}}, file {{applicationNo}} for {{ name }}")).toEqual(["name", "applicationNo"]);
    expect(extractVariables("plain")).toEqual([]);
  });
  it("previews with samples, leaving unknown placeholders visible", () => {
    expect(renderPreview("Hi {{name}}, {{stage}}", { name: "Asha" })).toBe("Hi Asha, {{stage}}");
  });
});

describe("formatPhone", () => {
  it("groups an Indian mobile and leaves other numbers alone", () => {
    expect(formatPhone("9820592765")).toBe("+91 98205 92765");
    expect(formatPhone("447911123456")).toBe("447911123456");
  });
});

describe("windowLeft", () => {
  const now = new Date("2026-11-05T12:00:00Z").getTime();
  it("counts down the 24 hours since the customer last wrote", () => {
    expect(windowLeft("2026-11-05T10:30:00Z", now)).toBe("22h 30m left");
    expect(windowLeft("2026-11-04T12:30:00Z", now)).toBe("30m left");
  });
  it("is null once closed, or when they have never written", () => {
    expect(windowLeft("2026-11-04T11:59:00Z", now)).toBeNull();
    expect(windowLeft(null, now)).toBeNull();
  });
});
