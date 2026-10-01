import { csvCell, neutraliseFormula, toCsv } from "./csv.util";

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

describe("spreadsheet formula injection", () => {
  it.each([
    ['=HYPERLINK("http://evil.example","click")', `'=HYPERLINK("http://evil.example","click")`],
    ["+1+1", "'+1+1"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\t=1+1", "'\t=1+1"],
    ["=cmd|' /C calc'!A0", "'=cmd|' /C calc'!A0"],
  ])("defuses %s", (input, expected) => {
    expect(neutraliseFormula(input)).toBe(expected);
  });

  it("leaves ordinary text, negative amounts and phone numbers alone", () => {
    for (const ok of ["Ravi Kumar", "-5000", "+919876543210", "-12,50,000", "3 = 3", "a=b", ""]) {
      expect(neutraliseFormula(ok)).toBe(ok);
    }
  });

  it("applies in exports, and a defused cell is still quoted when it needs it", () => {
    const out = toCsv([{ name: '=HYPERLINK("x","y")', amount: -5000, note: "ok" }]);
    expect(out).toContain(`"'=HYPERLINK(""x"",""y"")",-5000,ok`);
    expect(csvCell(-5000)).toBe("-5000");
  });
});
