import { answerKey, fieldsFor, nextField, parseAnswer, parseMoney, progress, renderQuestion, totalEmi, type Answers } from "./profile-schema";

const ask = (a: Answers, reply: string) => {
  const f = nextField(a)!;
  const p = parseAnswer(f, reply);
  if (!p.ok) throw new Error(`${f.id}: ${p.reason}`);
  return { ...a, [answerKey(f.id)]: p.value };
};
const get = (id: string) => fieldsFor({}).find((f) => f.id === id)!;

describe("loan profile answers", () => {
  it("reads Indian money wording", () => {
    expect(parseMoney("50 lakh")).toBe(5_000_000);
    expect(parseMoney("₹ 1.5 cr")).toBe(15_000_000);
    expect(parseMoney("4,50,000")).toBe(450_000);
    expect(parseMoney("40k")).toBe(40_000);
    expect(parseMoney("5L")).toBe(500_000);
    expect(parseMoney("no idea")).toBeNull();
  });

  it("only stores allowed options", () => {
    const f = get("loan-product");
    expect(parseAnswer(f, "1")).toEqual({ ok: true, value: "Home Loan (HL)" });
    expect(parseAnswer(f, "lap")).toEqual({ ok: true, value: "Loan Against Property (LAP)" });
    expect(parseAnswer(f, "I need a home loan")).toEqual({ ok: true, value: "Home Loan (HL)" });
    expect(parseAnswer(f, "something else").ok).toBe(false);
    expect(parseAnswer(get("profile"), "job")).toEqual({ ok: true, value: "Salaried" });
  });

  it("reads yes and no in English and Hinglish", () => {
    const f = get("coapp");
    for (const y of ["yes", "Haan", "ok", "Y"]) expect(parseAnswer(f, y)).toEqual({ ok: true, value: "Yes" });
    for (const n of ["no", "nahi", "N"]) expect(parseAnswer(f, n)).toEqual({ ok: true, value: "No" });
    expect(parseAnswer(f, "maybe").ok).toBe(false);
  });

  it("rejects an age that makes no sense and accepts a normal one", () => {
    expect(parseAnswer(get("age"), "17").ok).toBe(false);
    expect(parseAnswer(get("age"), "I am 34 years").ok && true).toBe(true);
    expect(parseAnswer(get("age"), "34")).toEqual({ ok: true, value: "34" });
  });

  it("takes several concern types", () => {
    const f = fieldsFor({ "lp-credit-concern": "Yes" }).find((x) => x.id === "credit-concern-types")!;
    expect(parseAnswer(f, "1, cheque bounce")).toEqual({ ok: true, value: "EMI Delay, Cheque Bounce" });
  });

  it("asks salaried and business questions separately", () => {
    const sal = fieldsFor({ "lp-profile": "Salaried" }).map((f) => f.id);
    expect(sal).toContain("sal-company");
    expect(sal).not.toContain("biz-name");
    const biz = fieldsFor({ "lp-profile": "Business Owner" }).map((f) => f.id);
    expect(biz).toContain("biz-turnover");
    expect(biz).not.toContain("sal-gross");
  });

  it("shows previous-employer questions only for under 2 years", () => {
    expect(fieldsFor({ "lp-profile": "Salaried", "lp-sal-lt2": "No" }).map((f) => f.id)).not.toContain("sal-prev-company");
    expect(fieldsFor({ "lp-profile": "Salaried", "lp-sal-lt2": "Yes" }).map((f) => f.id)).toContain("sal-prev-letter");
  });

  it("follows the property branch", () => {
    const base = { "lp-property-involved": "Yes" };
    expect(fieldsFor({ ...base, "lp-tx-type": "Resale Property" }).map((f) => f.id)).toContain("rs-mv");
    const ids = fieldsFor({ ...base, "lp-tx-type": "Builder Purchase", "lp-bp-status": "Ready to Move" }).map((f) => f.id);
    expect(ids).toContain("bp-builder");
    expect(ids).not.toContain("bp-possession");
    expect(fieldsFor({ ...base, "lp-tx-type": "Builder Purchase", "lp-bp-status": "Under Construction" }).map((f) => f.id)).toContain("bp-possession");
    expect(fieldsFor({ ...base, "lp-tx-type": "Self-Owned Property" }).map((f) => f.id)).toContain("so-occupancy");
    expect(fieldsFor({ "lp-property-involved": "No" }).map((f) => f.id)).not.toContain("tx-type");
  });

  it("repeats existing loans while the customer says to add another, and totals the EMIs", () => {
    let a: Answers = { "lp-has-loans": "Yes" };
    const loan = (n: number, emi: string) => ({
      [`lp-loan-${n}-bank`]: "HDFC", [`lp-loan-${n}-type`]: "Home Loan", [`lp-loan-${n}-original`]: "1", [`lp-loan-${n}-outstanding`]: "1",
      [`lp-loan-${n}-emi`]: emi, [`lp-loan-${n}-roi`]: "9", [`lp-loan-${n}-tenure`]: "5 years", [`lp-loan-${n}-since`]: "2020",
    });
    a = { ...a, ...loan(1, "20000"), "lp-add-loan-1": "Yes" };
    expect(fieldsFor(a).map((f) => f.id)).toContain("loan-2-bank");
    a = { ...a, ...loan(2, "5000"), "lp-add-loan-2": "No" };
    expect(fieldsFor(a).map((f) => f.id)).not.toContain("loan-3-bank");
    expect(totalEmi(a)).toBe(25000);
  });

  it("walks a whole salaried, no-property profile to completion", () => {
    let a: Answers = {};
    for (const r of ["hl", "75 lakh", "property purchase", "34", "salaried", "no", "Tata Consultancy", "2019", "Manager", "1.2 lakh", "95k", "no", "no", "no", "no", "no", "no", "750+", "no", "no"]) a = ask(a, r);
    expect(progress(a).complete).toBe(true);
    expect(a["lp-loan-amount"]).toBe("7500000");
  });

  it("lists the options by number when asking", () => {
    expect(renderQuestion(get("loan-product"))).toContain("1. Home Loan (HL)");
  });
});
