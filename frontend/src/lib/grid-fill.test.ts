import { describe, expect, it } from "vitest";
import { fillLast, lastSpan } from "./grid-fill";

describe("lastSpan", () => {
  it("leaves a full last row alone and stretches a short one", () => {
    expect(lastSpan(8, 4)).toBe(1);
    expect(lastSpan(7, 4)).toBe(2);
    expect(lastSpan(5, 4)).toBe(4);
    expect(lastSpan(6, 4)).toBe(3);
    expect(lastSpan(5, 2)).toBe(2);
    expect(lastSpan(4, 2)).toBe(1);
    expect(lastSpan(3, 1)).toBe(1);
    expect(lastSpan(0, 4)).toBe(1);
  });
});

describe("fillLast", () => {
  it("builds the class list for each breakpoint", () => {
    expect(fillLast(7, [{ at: "sm:", cols: 2 }, { at: "lg:", cols: 4 }])).toBe("sm:col-span-2 lg:col-span-2");
    expect(fillLast(8, [{ at: "sm:", cols: 2 }, { at: "lg:", cols: 4 }])).toBe("sm:col-span-1 lg:col-span-1");
  });
});
