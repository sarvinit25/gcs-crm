import { normalisePhone } from "./phone.util";

describe("normalisePhone", () => {
  it.each([
    ["9820592765", "9820592765"],
    ["+91 98205 92765", "9820592765"],
    ["91-9820592765", "9820592765"],
    ["098205 92765", "9820592765"],
    [" 836 9122426 ", "8369122426"],
    [9820592765, "9820592765"],
  ])("turns %p into %p", (input, expected) => expect(normalisePhone(input)).toBe(expected));

  it("returns nothing for blanks, and leaves a wrong-length number for validation to reject", () => {
    expect(normalisePhone("")).toBeUndefined();
    expect(normalisePhone("  ")).toBeUndefined();
    expect(normalisePhone(null)).toBeUndefined();
    expect(normalisePhone("12345")).toBe("12345");
  });
});
