import { contains, pickMatches, rankByName, score } from "./search.service";

describe("search matching", () => {
  it("matches case-insensitively anywhere in the text", () => {
    expect(contains("Bajaj Finserv", "FINS")).toBe(true);
    expect(contains("Bajaj Finserv", "hdfc")).toBe(false);
  });

  it("finds a phone number however it was typed", () => {
    expect(contains("9822044556", "98220 44556")).toBe(true);
    expect(contains("+91 98220 44556", "9822044556")).toBe(true);
    expect(contains("9822044556", "98220-44556")).toBe(true);
    expect(contains("9822044556", "12345")).toBe(false);
  });

  it("ranks exact over prefix over partial", () => {
    const rows = ["Personal Loan", "Education Loan Plus", "Education Loan", "Loan for education"];
    expect(rankByName(rows, (r) => r, ["education loan"])[0]).toBe("Education Loan");
    expect(score([{ label: "", value: "Bajaj" }], ["bajaj"])).toBe(3);
    expect(score([{ label: "", value: "Bajaj Finserv" }], ["bajaj"])).toBe(2);
    expect(score([{ label: "", value: "The Bajaj" }], ["bajaj"])).toBe(1);
  });

  it("reports which field each word matched in", () => {
    const m = pickMatches(
      [
        { label: "Applicant", value: "Sneha Kulkarni", section: "applicants" },
        { label: "Lender", value: "Bajaj Finserv" },
      ],
      ["sneha", "bajaj"],
    );
    expect(m.map((x) => x.label)).toEqual(["Applicant", "Lender"]);
    expect(m[0].section).toBe("applicants");
  });
});
