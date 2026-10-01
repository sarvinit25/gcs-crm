import { BadRequestException } from "@nestjs/common";
import { InputCeilingPipe, MAX_TEXT_LENGTH } from "./input-ceiling.pipe";

const pipe = new InputCeilingPipe();
const body = (value: unknown) => pipe.transform(value, { type: "body" });

describe("input ceiling", () => {
  it("lets ordinary requests through untouched", () => {
    const payload = { name: "Ravi", notes: "x".repeat(MAX_TEXT_LENGTH), amount: 25_00_00_000, rows: [{ a: 1 }] };
    expect(body(payload)).toBe(payload);
  });

  it("refuses text beyond the ceiling, naming the field", () => {
    expect(() => body({ notes: "x".repeat(MAX_TEXT_LENGTH + 1) })).toThrow(/notes is too long/);
    expect(() => body({ rows: [{ note: "x".repeat(MAX_TEXT_LENGTH + 1) }] })).toThrow(/rows\[0\]\.note/);
  });

  it("refuses absurd numbers that would overflow a money column", () => {
    expect(() => body({ amount: 1e21 })).toThrow(BadRequestException);
    expect(() => body({ amount: -1e21 })).toThrow(BadRequestException);
  });

  it("refuses very large arrays and deep nesting", () => {
    expect(() => body({ ids: new Array(5001).fill("a") })).toThrow(/too many items/);
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 12; i++) deep = (deep.next = {});
    expect(() => body(root)).toThrow(/nested too deeply/);
  });

  it("checks query strings too, and ignores custom parameters", () => {
    expect(() => pipe.transform("x".repeat(MAX_TEXT_LENGTH + 1), { type: "query", data: "search" })).toThrow(/search is too long/);
    expect(pipe.transform("x".repeat(MAX_TEXT_LENGTH + 1), { type: "custom" })).toHaveLength(MAX_TEXT_LENGTH + 1);
  });
});
