import { answersFromDetail, mergeAnswers } from "./lead-answers";

describe("lead answers", () => {
  it("reads Label: answer lines and skips headings", () => {
    const got = answersFromDetail("Detailed assessment (optional second form)\nLoan type: Home Loan\nProperty value: ₹50,00,000\n— More details from the website:\nCity: Pune");
    expect(got.map((a) => a.key)).toEqual(["loan-type", "property-value", "city"]);
    expect(got[1]!.value).toBe("₹50,00,000");
  });

  it("keeps a question once, the latest answer winning", () => {
    expect(answersFromDetail("Loan type: A\nLoan type: B")).toEqual([{ key: "loan-type", label: "Loan type", value: "B" }]);
  });

  it("lets explicit answers replace text ones and drops empty values", () => {
    const got = mergeAnswers(
      [{ key: "loanType", label: "Loan type", value: "Home Loan" }, { key: "x", label: "X", value: " " }],
      answersFromDetail("Loan type: Old"),
    );
    expect(got.find((a) => a.label === "Loan type")!.value).toBe("Home Loan");
    expect(got.some((a) => a.key === "x")).toBe(false);
  });

  it("splits several answers on one line and leaves identity numbers out", () => {
    const got = answersFromDetail("Organisation: Shah & Co — City: Thane — Could refer per month: 5 — keen to start\nPAN: ABCDE1234F | Bureau: CIBIL");
    expect(got.map((a) => a.key)).toEqual(["organisation", "city", "could-refer-per-month", "bureau"]);
    expect(got[2]!.value).toBe("5 — keen to start");
  });

  it("handles empty text", () => {
    expect(answersFromDetail(null)).toEqual([]);
  });
});
