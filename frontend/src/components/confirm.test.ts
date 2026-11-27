import { describe, expect, it } from "vitest";
import { actionFor, ask } from "./confirm";

describe("confirm window", () => {
  it("names the button after the action and marks removals", () => {
    expect(actionFor("Submit this application?")).toEqual({ label: "Submit application", danger: false });
    expect(actionFor('Delete "x"?')).toEqual({ label: "Delete", danger: true });
    expect(actionFor("Sending a new link stops the current one from working. Continue?").label).toBe("Continue");
  });
  it("answers no to an earlier question when a new one replaces it", async () => {
    const first = ask("Delete a?");
    void ask("Delete b?");
    expect(await first).toBe(false);
  });
});
