import { toCsv } from "./csv.util";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines and leaves plain values alone", () => {
    const out = toCsv([{ a: "x, y", b: 'say "hi"', c: "line\nbreak", d: "plain", e: null }]);
    expect(out.split("\n")[0]).toBe("a,b,c,d,e");
    expect(out).toContain('"x, y","say ""hi""","line\nbreak",plain,');
  });

  it("returns nothing for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});
