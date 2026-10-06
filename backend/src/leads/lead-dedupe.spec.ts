import { entryCount, isFuller, nameTokens, namesMatch } from "./lead-dedupe";

describe("namesMatch", () => {
  it("ignores case, order, punctuation and titles", () => {
    expect(namesMatch("Rahul Sharma", "rahul  SHARMA.")).toBe(true);
    expect(namesMatch("Sharma Rahul", "Rahul Sharma")).toBe(true);
    expect(namesMatch("Mr. Rahul Sharma", "Rahul Sharma")).toBe(true);
  });

  it("accepts a shorter form of the same name", () => {
    expect(namesMatch("Rahul", "Rahul Sharma")).toBe(true);
    expect(namesMatch("Rahul Sharma", "Rahul Kumar Sharma")).toBe(true);
  });

  it("rejects different people and empty names", () => {
    expect(namesMatch("Rahul Sharma", "Priya Sharma")).toBe(false);
    expect(namesMatch("Rahul Sharma", "Rahul Verma")).toBe(false);
    expect(namesMatch("", "Rahul")).toBe(false);
    expect(namesMatch("Mr", "Rahul")).toBe(false);
  });

  it("drops titles and non-letters when splitting", () => {
    expect(nameTokens("Dr. A.K. Rao")).toEqual(["a", "k", "rao"]);
  });
});

describe("entry counting", () => {
  const thin = { name: "Rahul Sharma", phone: "9876543210" };
  const full = { ...thin, email: "r@x.in", city: "Pune", loanType: "Home Loan", amount: 5_000_000, detail: "salaried" };

  it("counts only fields that are actually filled in", () => {
    expect(entryCount(thin)).toBe(2);
    expect(entryCount({ ...thin, email: "  ", city: null, amount: 0 })).toBe(3); // 0 is a value, blanks are not
    expect(entryCount(full)).toBe(7);
  });

  it("only a strictly fuller entry replaces the stored one", () => {
    expect(isFuller(full, thin)).toBe(true);
    expect(isFuller(thin, full)).toBe(false);
    expect(isFuller({ ...thin, city: "Pune" }, { ...thin, city: "Thane" })).toBe(false); // a tie keeps what staff may have corrected
  });
});
