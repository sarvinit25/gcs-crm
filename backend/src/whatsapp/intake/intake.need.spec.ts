import { INTAKE_GUIDE } from "./intake-guide";
import { bestNeed, loanPurposes, matchNeed, NEED_RULES } from "./intake.need";

describe("every loan can be recognised by what it is for", () => {
  it("has a purpose and some signals for each of the loans the assistant offers, and none for a loan it does not", () => {
    expect(Object.keys(NEED_RULES).sort()).toEqual(Object.keys(INTAKE_GUIDE).sort());
    for (const r of Object.values(NEED_RULES)) {
      expect(r.purpose.length).toBeGreaterThan(15);
      expect(r.signals.length).toBeGreaterThan(0);
    }
  });
  it("lists each loan with its purpose for the AI", () => {
    const text = loanPurposes((slug) => INTAKE_GUIDE[slug]!.title);
    expect(text.split("\n")).toHaveLength(Object.keys(INTAKE_GUIDE).length);
    expect(text).toContain("home-loan = Home Loan: buying, building");
  });
});

describe("bestNeed: a loan from the need, without its name", () => {
  const cases: [string, string][] = [
    ["I want to buy a flat in Thane", "home-loan"],
    ["planning to purchase a house", "home-loan"],
    ["mujhe ghar kharidna hai", "home-loan"],
    ["need to construct a bungalow on my plot", "home-loan"],
    ["want to shift my home loan to another bank for a lower rate", "balance-transfer"],
    ["need money against my shop", "loan-against-property"],
    ["mujhe apni property par loan chahiye", "loan-against-property"],
    ["I want a lump sum on mortgage of my flat", "loan-against-property"],
    ["overdraft against my property where I pay interest only on what I use", "dlod"],
    ["my business needs funds to expand", "business-loan"],
    ["I run a small kirana shop and need a loan", "micro-business-loan"],
    ["want to buy a CNC machine for my factory", "machine-loan"],
    ["need loan for my daughter's masters in Canada", "education-loan"],
    ["want to study abroad", "education-loan"],
    ["we want to expand our school building", "education-infrastructure-loan"],
    ["I am buying a new car", "new-car-loan"],
    ["looking for a second hand car loan", "used-car-loan"],
    ["need cash against my car", "car-refinance"],
    ["need to buy a truck for my transport", "commercial-vehicle"],
    ["loan against my shares and mutual funds", "loan-against-securities"],
    ["I am a doctor and need a loan to set up my clinic", "professional-loan"],
    ["need funds for my son's wedding", "personal-loan"],
    ["I want to combine my many EMIs into one", "loan-consolidation"],
    ["need bank guarantee for a tender", "bank-guarantee"],
    ["we want invoice discounting for our bills", "bill-discounting"],
    ["rent income from my leased shop, want loan against the rental", "lease-rental-discounting"],
    ["banks have rejected my case, need private funding", "private-funding"],
  ];
  it.each(cases)("reads %j as %s", (said, slug) => expect(bestNeed(said)).toBe(slug));

  it("stays quiet when the need is not clear, so the customer is asked", () => {
    for (const t of ["I need a loan", "need money urgently", "Mumbai", "40 lakh", "hi", "can you help me", "working capital", ""]) expect(bestNeed(t)).toBeNull();
  });
  it("does not guess between two loans it cannot tell apart", () => {
    // an overdraft limit and a working capital loan both fit this: the customer is asked
    expect(bestNeed("I need an overdraft limit or a working capital loan")).toBeNull();
    expect(matchNeed("I need working capital").map((m) => m.slug)).toContain("working-capital-term-loan");
  });
});
