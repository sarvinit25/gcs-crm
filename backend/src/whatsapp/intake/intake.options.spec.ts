import { AMOUNT_RANGES, MAIN_LOANS, optionsFor, parseTap, shorten } from "./intake.options";

describe("tap-to-choose options", () => {
  it("decodes what the customer tapped", () => {
    expect(parseTap("loan|home-loan")).toEqual({ kind: "loan", slug: "home-loan" });
    expect(parseTap("loan|other")).toEqual({ kind: "loan-other" });
    expect(parseTap("amt|3750000")).toEqual({ kind: "amount", value: 3_750_000, label: "₹25 – 50 lakh" });
    expect(parseTap("amt|type")).toEqual({ kind: "amount-type" });
    expect(parseTap("ans|yearsRunning|2")).toEqual({ kind: "answer", key: "yearsRunning", index: 2 });
    expect(parseTap("you|0")).toEqual({ kind: "you", index: 0 });
    expect(parseTap("you|9")).toBeNull();
    expect(parseTap("more|yes")).toEqual({ kind: "more", yes: true });
    expect(parseTap("more|no")).toEqual({ kind: "more", yes: false });
    expect(parseTap("junk")).toBeNull();
    expect(parseTap("amt|12345")).toBeNull();
    expect(parseTap(undefined)).toBeNull();
  });

  it("stays within WhatsApp's limits: 3 buttons, or up to 10 list rows", () => {
    const loans = optionsFor("loan_slug")!;
    expect(loans.kind).toBe("list");
    expect(loans.choices.length).toBeLessThanOrEqual(10);
    expect(MAIN_LOANS.length + 1).toBeLessThanOrEqual(10);
    expect(optionsFor("loan_amount")!.choices.length).toBe(AMOUNT_RANGES.length + 1);
    expect(optionsFor("x", { kind: "choice", options: ["Yes", "No"] })!.kind).toBe("buttons");
    expect(optionsFor("x", { kind: "choice", options: ["a", "b", "c", "d"] })!.kind).toBe("list");
    expect(optionsFor("x", { kind: "choice", options: Array.from({ length: 11 }, (_, i) => `o${i}`) })).toBeNull();
    expect(optionsFor("x", { kind: "text" })).toBeNull();
  });

  it("shortens a title to the limit without cutting mid-word", () => {
    expect(shorten("Unsecured Funding for Schools", 20).length).toBeLessThanOrEqual(20);
    expect(shorten("Up to ₹5 lakh", 24)).toBe("Up to ₹5 lakh");
    expect(shorten("Ready-to-move flat or house", 24)).toBe("Ready-to-move flat or…");
  });
});

describe("reaching every one of the 28 loans by tap", () => {
  const { loanGroups } = jest.requireActual("./intake.engine");
  const { parseTap, groupOptions, groupLoanOptions, optionsFor } = jest.requireActual("./intake.options");
  it("offers 'More loan types' on the first list and the groups after it", () => {
    expect(optionsFor("loan_slug").choices.at(-1).id).toBe("loan|more");
    expect(parseTap("loan|more")).toEqual({ kind: "loan-more" });
    expect(groupOptions().choices.length).toBeLessThanOrEqual(10);
  });
  it("every loan sits in one group list that fits WhatsApp's 10 rows", () => {
    const groups = loanGroups();
    expect(groups.reduce((n: number, g: { loans: unknown[] }) => n + g.loans.length, 0)).toBe(28);
    groups.forEach((g: { loans: { slug: string }[] }, i: number) => {
      const o = groupLoanOptions(i);
      expect(o.choices.length).toBeLessThanOrEqual(10);
      for (const l of g.loans) expect(o.choices.some((c: { id: string }) => c.id === `loan|${l.slug}`)).toBe(true);
      expect(parseTap(`loan|g|${i}`)).toEqual({ kind: "loan-group", index: i });
    });
  });
});
