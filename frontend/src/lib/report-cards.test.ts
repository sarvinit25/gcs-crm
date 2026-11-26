import { describe, expect, it } from "vitest";
import { REPORT_CARD_TEXT, reportCardText } from "./reports";

// the eight reports the server offers (backend/src/reports/report-kinds.ts)
const KINDS = ["leads", "callbacks", "files", "login-files", "sanctions", "disbursals", "rejects", "commissions"];

describe("the detailed report cards", () => {
  it("name and describe each of the eight reports", () => {
    expect(Object.keys(REPORT_CARD_TEXT).sort()).toEqual([...KINDS].sort());
    for (const k of KINDS) {
      expect(REPORT_CARD_TEXT[k]!.title).toMatch(/ Report$/);
      expect(REPORT_CARD_TEXT[k]!.blurb.length).toBeGreaterThan(10);
    }
  });
  it("uses the card wording, and the server's own for a report it does not know", () => {
    expect(reportCardText({ kind: "login-files", title: "Login files", blurb: "x" })).toEqual({ title: "Login Files Report", blurb: "Files logged in with lenders" });
    expect(reportCardText({ kind: "new-one", title: "New one", blurb: "Something new" })).toEqual({ title: "New one", blurb: "Something new" });
  });
});
