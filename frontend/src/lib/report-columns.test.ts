import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  groupColumns,
  orderedSelection,
  sectionState,
  selectAll,
  selectionSummary,
  toggleColumn,
  toggleSection,
  type TypeCatalogue,
} from "./report-columns";

const cat: TypeCatalogue = {
  type: "applications",
  label: "Files",
  noun: "file",
  sections: [
    { id: "file", label: "File" },
    { id: "applicant", label: "Applicant" },
    { id: "empty", label: "Nothing here" },
  ],
  columns: [
    { key: "applicationNo", label: "Application no.", type: "text", section: "file", standard: true },
    { key: "status", label: "Status", type: "text", section: "file" },
    { key: "customer", label: "Customer", type: "text", section: "applicant", standard: true },
    { key: "pan", label: "PAN", type: "text", section: "applicant" },
  ],
  standardColumns: ["applicationNo", "customer"],
};

describe("column picker", () => {
  it("groups by section and drops sections with no columns", () => {
    expect(groupColumns(cat, "").map((g) => g.section.id)).toEqual(["file", "applicant"]);
  });

  it("searches column labels and section names, ignoring case", () => {
    expect(groupColumns(cat, "pan").map((g) => g.columns.map((c) => c.key))).toEqual([["pan"]]);
    expect(groupColumns(cat, "APPLICANT").flatMap((g) => g.columns.map((c) => c.key))).toEqual(["customer", "pan"]);
    expect(groupColumns(cat, "zzz")).toEqual([]);
  });

  it("selects and clears one section without touching the others", () => {
    const [file, applicant] = groupColumns(cat, "");
    const start = new Set(["customer"]);
    expect(sectionState(file, start)).toBe("none");
    expect(sectionState(applicant, start)).toBe("some");
    const withFile = toggleSection(file, start);
    expect([...withFile].sort()).toEqual(["applicationNo", "customer", "status"]);
    expect(sectionState(file, withFile)).toBe("all");
    const cleared = toggleSection(file, withFile);
    expect([...cleared]).toEqual(["customer"]);
    // a partly-selected section is completed first
    expect(sectionState(applicant, toggleSection(applicant, start))).toBe("all");
  });

  it("toggles one column, selects all and counts", () => {
    expect([...toggleColumn("pan", new Set())]).toEqual(["pan"]);
    expect([...toggleColumn("pan", new Set(["pan"]))]).toEqual([]);
    expect(selectAll(cat).size).toBe(4);
    expect(selectionSummary(2, 4)).toBe("2 of 4 columns selected");
  });

  it("exports in catalogue order whatever order they were ticked", () => {
    expect(orderedSelection(cat, new Set(["pan", "applicationNo", "status"]))).toEqual(["applicationNo", "status", "pan"]);
  });

  it("loads a template, ignoring columns the catalogue no longer has", () => {
    expect([...applyTemplate(cat, ["customer", "gone", "pan"])]).toEqual(["customer", "pan"]);
  });
});
