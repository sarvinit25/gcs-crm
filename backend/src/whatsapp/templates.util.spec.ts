import { DEFAULT_TEMPLATES, TRIGGERS, examplesFor, extractVariables, metaName, orderedValues, renderTemplate, templateProblem, toMetaBody } from "./templates.util";

describe("template wording", () => {
  const body = "Hello {{name}}, your file {{applicationNo}} is {{stage}}. Thanks, {{name}}.";

  it("finds placeholders in order, once each", () => {
    expect(extractVariables(body)).toEqual(["name", "applicationNo", "stage"]);
    expect(extractVariables("no placeholders here")).toEqual([]);
    expect(extractVariables("{{ name }} and {{name}}")).toEqual(["name"]);
  });

  it("fills them in, and blanks one it has no value for", () => {
    expect(renderTemplate(body, { name: "Asha", applicationNo: "GCS-1", stage: "Sanctioned" })).toBe(
      "Hello Asha, your file GCS-1 is Sanctioned. Thanks, Asha.",
    );
    expect(renderTemplate("Hi {{name}}!", {})).toBe("Hi !");
  });

  it("numbers them the way Meta wants, reusing a number for a repeat", () => {
    expect(toMetaBody(body)).toBe("Hello {{1}}, your file {{2}} is {{3}}. Thanks, {{1}}.");
    expect(orderedValues(body, { name: "A", applicationNo: "B", stage: "C" })).toEqual(["A", "B", "C"]);
  });

  it("gives Meta a sample for every placeholder", () => {
    expect(examplesFor("Hi {{name}}, ref {{applicationNo}}.", "FILE_STAGE_CHANGED")).toEqual(["Rahul Mehta", "GCS-2026-0042"]);
  });

  describe("templateProblem", () => {
    it("accepts good wording", () => {
      expect(templateProblem("Hello {{name}}, thanks for writing.", "LEAD_CREATED")).toBeNull();
    });
    it("rejects what Meta would reject", () => {
      expect(templateProblem("", "LEAD_CREATED")).toMatch(/empty/);
      expect(templateProblem("{{name}} thanks", "LEAD_CREATED")).toMatch(/start with a placeholder/);
      expect(templateProblem("Thanks {{name}}", "LEAD_CREATED")).toMatch(/end with a placeholder/);
      expect(templateProblem("x".repeat(1025), "LEAD_CREATED")).toMatch(/1,024/);
    });
    it("rejects a placeholder the trigger can't supply, and says what is available", () => {
      expect(templateProblem("Hi {{name}}, {{amount}} done.", "LEAD_CREATED")).toMatch(/\{\{amount\}\} isn't available.*\{\{loanType\}\}/);
    });
  });

  it("makes Meta-safe names", () => {
    expect(metaName("Sanction Approved (customer)!")).toBe("sanction_approved_customer");
  });

  it("every default template is valid for its own trigger and recipient", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(templateProblem(t.body, t.trigger)).toBeNull();
      expect(TRIGGERS[t.trigger].recipients).toContain(t.recipient);
      expect(t.code).toBe(metaName(t.code));
    }
    // One per trigger and recipient — that pair is unique in the database.
    const pairs = DEFAULT_TEMPLATES.map((t) => `${t.trigger}/${t.recipient}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});
