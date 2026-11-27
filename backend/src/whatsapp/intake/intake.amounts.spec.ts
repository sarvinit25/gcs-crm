import { checkAnswer, hasFigure, parseMoney } from "./intake.engine";
import { loanFor } from "./intake.engine";

describe("amounts written the way people write them", () => {
  const cases: [string, number][] = [
    ["40 lakh", 4_000_000], ["40 lakhs", 4_000_000], ["40 Lac", 4_000_000], ["40 lacs", 4_000_000], ["40L", 4_000_000], ["40 L", 4_000_000], ["40l", 4_000_000],
    ["1.5 crore", 15_000_000], ["1.5 Crores", 15_000_000], ["1.5cr", 15_000_000], ["1.5 CR", 15_000_000], ["1.5 Cr.", 15_000_000], ["2 cr", 20_000_000], ["2Cr", 20_000_000],
    ["₹40 lakh", 4_000_000], ["Rs. 40 lakh", 4_000_000], ["Rs 40,00,000", 4_000_000], ["INR 40 lakhs", 4_000_000], ["40,00,000", 4_000_000], ["4000000", 4_000_000],
    ["40 lakh rupees", 4_000_000], ["40 lakhs only", 4_000_000], ["Rs.40,00,000/-", 4_000_000], ["rupees 25 lakh", 2_500_000],
    ["50k", 50_000], ["50 K", 50_000], ["50 thousand", 50_000], ["75,000", 75_000], ["0.5 crore", 5_000_000], ["half a crore", 5_000_000], ["1 crore 20 lakh", 12_000_000], ["1.25 cr", 12_500_000],
  ];
  it.each(cases)("reads %j as %d", (said, n) => expect(parseMoney(said)).toBe(n));

  it("does not take a loose number for an amount", () => {
    for (const t of ["Mumbai", "hello", "around five", "lakh"]) expect(parseMoney(t)).toBeNull();
  });
  it("writes an amount the Indian way once it is checked", () => {
    const field = loanFor("home-loan")!.fields.find((f) => f.kind === "amount")!;
    expect(checkAnswer(field, "1.5 Cr")).toEqual({ ok: true, value: "₹1,50,00,000" });
    expect(checkAnswer(field, "40L")).toEqual({ ok: true, value: "₹40,00,000" });
    expect(checkAnswer(field, "Rs 40 lakhs only")).toEqual({ ok: true, value: "₹40,00,000" });
  });
  it("sees a figure in the customer's words, including Hindi and Marathi number words", () => {
    for (const t of ["40L", "1.5 Cr", "do lakh", "डेढ़ करोड़", "पाच लाख", "paanch lakh"]) expect(hasFigure(t)).toBe(true);
  });
});
