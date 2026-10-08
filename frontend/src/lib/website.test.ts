import { describe, expect, it } from "vitest";
import { OUTCOME_LABEL, formLabel } from "./website";

describe("formLabel", () => {
  it("names the forms the website sends today", () => {
    expect(formLabel("ca-legal-enquiry")).toBe("CA & Legal enquiry");
    expect(formLabel("checklist-download")).toBe("Checklist download");
  });

  it("tidies up a form it has not heard of instead of hiding it", () => {
    expect(formLabel("emi-calculator_callback")).toBe("Emi calculator callback");
    expect(formLabel("")).toBe("Unknown form");
  });
});

describe("outcomes", () => {
  it("has a label for every outcome the server can return", () => {
    expect(Object.keys(OUTCOME_LABEL).sort()).toEqual(["DUPLICATE_KEPT", "DUPLICATE_UPDATED", "NEW_LEAD"]);
  });
});

import { adFileProblem } from "./website";

describe("adFileProblem", () => {
  it("accepts PNG, JPG and WebP up to 3 MB", () => {
    expect(adFileProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(adFileProblem({ type: "image/jpeg", size: 3 * 1024 * 1024 })).toBeNull();
    expect(adFileProblem({ type: "image/webp", size: 10 })).toBeNull();
  });

  it("says what is wrong with anything else", () => {
    expect(adFileProblem({ type: "application/pdf", size: 10 })).toMatch(/PNG, JPG or WebP/);
    expect(adFileProblem({ type: "image/png", size: 3 * 1024 * 1024 + 1 })).toMatch(/3 MB/);
  });
});
