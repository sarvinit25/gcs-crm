import { describe, expect, it } from "vitest";
import { MAX_CHARS, MAX_TURNS, suggestions, toRequest, type ChatMessage } from "./assistant";

const msg = (id: number, role: ChatMessage["role"], content: string, failed = false): ChatMessage => ({ id, role, content, failed });

describe("toRequest", () => {
  it("sends the conversation in order", () => {
    expect(toRequest([msg(1, "user", "hi"), msg(2, "assistant", "hello"), msg(3, "user", "more")])).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "more" },
    ]);
  });

  it("leaves out turns that failed, so the server never sees an unanswered question twice", () => {
    const out = toRequest([msg(1, "user", "a", true), msg(2, "user", "b")]);
    expect(out).toEqual([{ role: "user", content: "b" }]);
  });

  it("keeps only the latest turns and starts on the person's own words", () => {
    const many = Array.from({ length: 30 }, (_, i) => msg(i, i % 2 === 0 ? "user" : "assistant", `m${i}`));
    const out = toRequest(many);
    expect(out.length).toBeLessThanOrEqual(MAX_TURNS);
    expect(out[0].role).toBe("user");
  });

  it("trims over-long turns to the server's limit", () => {
    expect(toRequest([msg(1, "user", "x".repeat(MAX_CHARS + 500))])[0].content).toHaveLength(MAX_CHARS);
  });

  it("an empty chat sends nothing", () => {
    expect(toRequest([])).toEqual([]);
  });
});

describe("suggestions", () => {
  it("offers Staff no money questions", () => {
    expect(suggestions("ADVISOR").join(" ")).not.toMatch(/disburse/i);
    expect(suggestions("ADMIN").join(" ")).toMatch(/disburse/i);
  });
});
