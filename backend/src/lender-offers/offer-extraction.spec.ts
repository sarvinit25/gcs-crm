import { bestLender, cleanPhone, mergeOffers, offerEnded, normalizeExtraction, tenureFromText, toRupees } from "./offer-extraction";

const SLUGS = new Set(["micro-lap", "micro-business-loan", "private-funding", "business-loan"]);

describe("reading amounts and phone numbers off a flyer", () => {
  it("understands lakh, lac, crore and plain numbers", () => {
    expect(toRupees("₹10 Lacs")).toBe(1_000_000);
    expect(toRupees("7.5 Lakhs")).toBe(750_000);
    expect(toRupees("₹ 50 Crs")).toBe(500_000_000);
    expect(toRupees("1,50,000")).toBe(150_000);
    expect(toRupees(300000)).toBe(300_000);
    expect(toRupees("up to ten")).toBeNull();
    expect(toRupees(-5)).toBeNull();
  });
  it("keeps an Indian number as ten digits", () => {
    expect(cleanPhone("+91 98200 78209")).toBe("9820078209");
    expect(cleanPhone("09820078209")).toBe("9820078209");
    expect(cleanPhone("91 22 4096 4200")).toBe("2240964200");
    expect(cleanPhone("12")).toBeNull();
  });
});

describe("making the model's reading safe", () => {
  const manba = {
    kind: "LENDER_OFFER",
    summary: "Manba Finance micro LAP schemes",
    lenderName: "Manba Finance",
    lenderType: "NBFC",
    contacts: [{ name: null, phone: "not shown", email: null }],
    offers: [
      { scheme: "Quasi", productSlug: "micro-lap", minAmount: "3 lakh", maxAmount: "7.5 lakh", minRate: 23, maxRate: 24, minTenureMonths: 12, maxTenureMonths: 60, gstRequired: false },
      { scheme: "Property Power", productSlug: "micro-lap", minAmount: "5 lakh", maxAmount: "10 lakh", minRate: "21%", maxRate: "22%", minTenureMonths: 12, maxTenureMonths: 84, gstRequired: false },
      { scheme: "Micro LAP", productSlug: "micro-lap", minAmount: "10 lakh", maxAmount: "20 lakh", minRate: 19, maxRate: 20, minTenureMonths: 12, maxTenureMonths: 120, gstRequired: false },
    ],
  };

  it("keeps only what is valid and drops a product we do not offer", () => {
    const x = normalizeExtraction({ ...manba, offers: [...manba.offers, { scheme: "Gold loan", productSlug: "gold-loan", minRate: 12 }] }, SLUGS);
    expect(x.offers).toHaveLength(4);
    expect(x.offers[3]!.productSlug).toBeNull();
    expect(x.contacts).toEqual([]);
    expect(x.offers[0]).toMatchObject({ minAmount: 300_000, maxAmount: 750_000, minRate: 23, maxRate: 24 });
  });

  it("merges three schemes into one micro-LAP policy and keeps each scheme in the notes", () => {
    const { policies } = mergeOffers(normalizeExtraction(manba, SLUGS).offers);
    expect(policies).toHaveLength(1);
    const p = policies[0]!;
    expect(p).toMatchObject({ productSlug: "micro-lap", minAmount: 300_000, maxAmount: 2_000_000, minRate: 19, maxRate: 24, minTenureMonths: 12, maxTenureMonths: 120, gstRequired: false, schemes: 3 });
    expect(p.specialScheme).toBe("Quasi, Property Power, Micro LAP");
    expect(p.notes).toContain("Quasi");
    expect(p.notes).toContain("Property Power");
  });

  it("turns a monthly rate into the yearly figure", () => {
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [{ productSlug: "private-funding", minRate: 2.7, ratePeriod: "MONTH" }] }, SLUGS);
    expect(x.offers[0]!.minRate).toBe(32.4);
  });

  it("puts a swapped range the right way round and ignores impossible values", () => {
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [{ productSlug: "business-loan", minAmount: "20 lakh", maxAmount: "5 lakh", minRate: 250, minCreditScore: 1200 }] }, SLUGS);
    expect(x.offers[0]).toMatchObject({ minAmount: 500_000, maxAmount: 2_000_000, minRate: null, minCreditScore: null });
  });

  it("gives a credit-repair advert no loan terms at all", () => {
    const x = normalizeExtraction({ kind: "SERVICE_PROVIDER", lenderName: "Credit Pandit", offers: [{ productSlug: "business-loan", minRate: 10 }], contacts: [{ phone: "+91 83568 39421" }] }, SLUGS);
    expect(x.kind).toBe("SERVICE_PROVIDER");
    expect(x.offers).toEqual([]);
    expect(x.contacts[0]!.phone).toBe("8356839421");
  });

  it("treats nonsense as an unrelated advert", () => {
    expect(normalizeExtraction("lol", SLUGS).kind).toBe("OTHER");
    expect(normalizeExtraction({ kind: "ROCKET" }, SLUGS).kind).toBe("OTHER");
  });
});

describe("finding the lender already in the CRM", () => {
  const lenders = [
    { id: "1", name: "Manba Finance" },
    { id: "2", name: "HDFC Bank" },
    { id: "3", name: "Bajaj Finserv", shortName: "Bajaj" },
  ];
  it("matches on the whole name, ignoring Ltd and Pvt", () => {
    expect(bestLender("Manba Finance Pvt. Ltd.", lenders)?.id).toBe("1");
    expect(bestLender("HDFC", lenders)?.id).toBe("2");
    expect(bestLender("Bajaj", lenders)?.id).toBe("3");
  });
  it("never guesses on a shared word", () => {
    expect(bestLender("Accord Finserve Solutions Pvt. Ltd.", lenders)).toBeNull();
    expect(bestLender(null, lenders)).toBeNull();
  });
});

import { cleanProgram } from "../lender-policies/policy-extras";
import { fillContact, mergeIntoPolicy, normalizedForHash, type ExistingPolicy, type PolicyDraft } from "./offer-extraction";

const held = (over: Partial<ExistingPolicy> = {}): ExistingPolicy => ({
  minAmount: 300_000, maxAmount: 2_000_000, minRate: 19, maxRate: 24, minTenureMonths: 12, maxTenureMonths: 120, rateType: null, processingFee: null,
  specialScheme: "Quasi, Property Power", employmentTypes: ["Salaried"], cities: ["Mumbai"], gstRequired: false, allIndia: false, minCreditScore: null, notes: null,
  minAge: null, maxAgeAtMaturity: null, minAnnualTurnover: null, minBusinessVintageMonths: null, hasFoir: false, programs: [], conditions: {}, ...over,
});
const flyer = (over: Partial<PolicyDraft> = {}): PolicyDraft => ({
  productSlug: "micro-lap", minAmount: 300_000, maxAmount: 2_000_000, minRate: 19, maxRate: 24, minTenureMonths: 12, maxTenureMonths: 120, rateType: null, processingFee: null,
  specialScheme: "Quasi, Property Power", employmentTypes: ["Salaried"], gstRequired: false, minCreditScore: null, allIndia: false, cities: ["Mumbai"], notes: "turnaround 4 days", schemes: 2,
  minAge: null, maxAge: null, minAnnualTurnover: null, minBusinessVintageMonths: null, foirPct: null, programs: [], conditions: {}, ...over,
});

describe("adding a new flyer to a policy that already exists", () => {
  it("changes nothing when the flyer only repeats what is already held", () => {
    const already = held({ notes: "From flyer 2026-11-09: turnaround 4 days" });
    expect(mergeIntoPolicy(already, flyer(), "2026-11-10")).toEqual({ fields: {}, changes: [] });
  });

  it("widens a range and never narrows one", () => {
    const wider = mergeIntoPolicy(held({ notes: "From flyer 2026-11-09: turnaround 4 days" }), flyer({ maxAmount: 2_500_000, minRate: 18 }), "2026-11-10");
    expect(wider.fields).toMatchObject({ maxAmount: 2_500_000, minAmount: 300_000, minRate: 18, maxRate: 24 });
    expect(wider.changes.join(" | ")).toContain("amount now ₹3,00,000 to ₹25,00,000");
    const narrower = mergeIntoPolicy(held({ notes: "From flyer 2026-11-09: turnaround 4 days" }), flyer({ maxAmount: 1_000_000, minRate: 21, maxRate: 22 }), "2026-11-10");
    expect(narrower.fields).toEqual({});
  });

  it("adds only the entries a list lacked, ignoring capitals", () => {
    const m = mergeIntoPolicy(held({ notes: "From flyer 2026-11-09: turnaround 4 days" }), flyer({ cities: ["mumbai", "Pune"], employmentTypes: ["Salaried", "Self-employed"], specialScheme: "quasi, Micro LAP" }), "2026-11-10");
    expect(m.fields).toMatchObject({ cities: ["Mumbai", "Pune"], employmentTypes: ["Salaried", "Self-employed"], specialScheme: "Quasi, Property Power, Micro LAP" });
  });

  it("fills a blank but never overwrites a value it already has", () => {
    const m = mergeIntoPolicy(held({ minRate: null, maxRate: null, rateType: "FIXED", processingFee: "1% plus GST", notes: "From flyer 2026-11-09: turnaround 4 days" }), flyer({ rateType: "FLOATING", processingFee: "1% plus GST" }), "2026-11-10");
    expect(m.fields).toMatchObject({ minRate: 19, maxRate: 24 });
    expect(m.fields.rateType).toBeUndefined();
    expect(m.fields.processingFee).toBeUndefined();
  });

  it("writes a note once, and a different note is added beneath it", () => {
    const base = held({ notes: "From flyer 2026-11-09: turnaround 4 days" });
    expect(mergeIntoPolicy(base, flyer({ notes: "Turnaround 4 days." }), "2026-11-10").fields.notes).toBeUndefined();
    const m = mergeIntoPolicy(base, flyer({ notes: "login fee 1,180" }), "2026-11-10");
    expect(m.fields.notes).toBe("From flyer 2026-11-09: turnaround 4 days\nFrom flyer 2026-11-10: login fee 1,180");
  });

  it("treats GST as not needed once any scheme says so, and never makes it needed", () => {
    const base = { notes: "From flyer 2026-11-09: turnaround 4 days" };
    expect(mergeIntoPolicy(held({ ...base, gstRequired: true }), flyer({ gstRequired: false }), "d").fields.gstRequired).toBe(false);
    expect(mergeIntoPolicy(held({ ...base, gstRequired: false }), flyer({ gstRequired: true }), "d").fields.gstRequired).toBeUndefined();
  });
});

describe("a contact already on file", () => {
  const have = { name: "Contact from flyer", designation: null, phone: "9820011223", email: null, segments: ["Micro LAP"] };
  it("gets its blanks filled and nothing replaced", () => {
    const { data, filled } = fillContact(have, { name: "Rohit Shah", designation: "RM", phone: "9820011223", email: "r@x.in" }, ["Micro LAP", "Business Loan"]);
    expect(data).toEqual({ name: "Rohit Shah", designation: "RM", email: "r@x.in", segments: ["Micro LAP", "Business Loan"] });
    expect(filled).toEqual(["name", "designation", "email", "loan types"]);
  });
  it("keeps a real name and reports nothing to change when there is nothing new", () => {
    const named = { ...have, name: "Rohit", designation: "RM", email: "r@x.in" };
    expect(fillContact(named, { name: "Someone Else", designation: "Head", phone: "9820011223", email: "other@x.in" }, ["Micro LAP"])).toEqual({ data: {}, filled: [] });
  });
});

describe("recognising the same text put in twice", () => {
  it("ignores spacing and capitals", () => {
    expect(normalizedForHash("Manba  Finance\n  Micro LAP")).toBe(normalizedForHash("manba finance micro lap "));
  });
});

describe("telling lenders with a shared first word apart", () => {
  const crm = [
    { id: "ab", name: "Axis Bank" }, { id: "af", name: "Axis Finance" },
    { id: "bf", name: "Bajaj Finserv", shortName: "Bajaj" }, { id: "bh", name: "Bajaj Housing" },
    { id: "ib", name: "ICICI Bank" }, { id: "fb", name: "Federal Bank" },
    { id: "au", name: "AU Small Finance" }, { id: "ch", name: "Cholamandalam" },
    { id: "sb", name: "SBI" }, { id: "sh", name: "SBI Home Loans" },
    { id: "hb", name: "HDFC Bank" }, { id: "hs", name: "HDFC Sales" }, { id: "hf", name: "Hero FinCorp" },
  ];
  const id = (n: string | null) => bestLender(n, crm)?.id ?? null;

  it("keeps Axis Bank and Axis Finance apart, in both directions", () => {
    expect(id("Axis Bank Ltd")).toBe("ab");
    expect(id("Axis Finance")).toBe("af");
    expect(id("AXIS FINANCE LIMITED")).toBe("af");
  });
  it("gives Bajaj Housing its own flyers, not Bajaj Finserv's", () => {
    expect(id("Bajaj housing finance Limited")).toBe("bh");
    expect(id("Bajaj Finserv")).toBe("bf");
    expect(id("Bajaj")).toBe("bf");
  });
  it("finds a lender written a little differently, when only one fits", () => {
    expect(id("AU Small Finance Bank")).toBe("au");
    expect(id("CHOLAMANDALAM INVESTMENT & FINANCE CO. LTD.")).toBe("ch");
    expect(id("CHOLA MANDALAM")).toBe("ch");
    expect(id("HDFC")).toBe("hb");
    expect(id("SBI")).toBe("sb");
    expect(id("SBI Home Loans")).toBe("sh");
  });
  it("guesses nothing when it could be two lenders, or a different company", () => {
    expect(id("Axis")).toBeNull();
    expect(id("ICICI Home Finance Co. Ltd")).toBeNull();
    expect(id("FedBank Financial Services Ltd")).toBeNull();
    expect(id("Hero Housing Finance Ltd")).toBeNull();
    expect(id(null)).toBeNull();
  });
});

describe("schemes with nothing to record, and offers that have ended", () => {
  it("does not make a policy out of a scheme that is only a name", () => {
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [{ scheme: "Business Overdraft", productSlug: "business-loan" }, { scheme: "Micro LAP", productSlug: "micro-lap", minRate: 19 }] }, SLUGS);
    const m = mergeOffers(x.offers);
    expect(m.policies.map((p) => p.productSlug)).toEqual(["micro-lap"]);
    expect(m.empty).toBe(1);
  });
  it("keeps a scheme that only carries a note or a charge", () => {
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [{ scheme: "March Spl", productSlug: "business-loan", charges: "Login fee 999 + GST" }] }, SLUGS);
    expect(mergeOffers(x.offers).policies).toHaveLength(1);
  });
  it("reads a valid-till date only when it is a real date", () => {
    expect(normalizeExtraction({ kind: "OTHER", validTill: "2026-09-30" }, SLUGS).validTill).toBe("2026-09-30");
    expect(normalizeExtraction({ kind: "OTHER", validTill: "2026-02-31" }, SLUGS).validTill).toBeNull();
    expect(normalizeExtraction({ kind: "OTHER", validTill: "30th Sep" }, SLUGS).validTill).toBeNull();
  });
  it("says an offer has ended only after its last day", () => {
    expect(offerEnded("2026-09-30", "2026-11-09")).toBe(true);
    expect(offerEnded("2026-09-30", "2026-09-30")).toBe(false);
    expect(offerEnded(null, "2026-11-09")).toBe(false);
  });
  it("keeps LTV only when it is a percentage", () => {
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [{ productSlug: "micro-lap", minRate: 20, ltv: "Registered Sale Deed, Namuna 8" }, { productSlug: "business-loan", minRate: 20, ltv: "55% - 75%" }] }, SLUGS);
    expect(x.offers.map((o) => o.ltv)).toEqual([null, "55% - 75%"]);
  });
  it("does not read a printed zero as a minimum loan size", () => {
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [{ productSlug: "micro-lap", minAmount: 0, maxAmount: "50 lakh", minRate: 7.5 }] }, SLUGS);
    expect([x.offers[0]!.minAmount, x.offers[0]!.maxAmount]).toEqual([null, 5_000_000]);
  });
  it("drops a minimum amount that ends up above the maximum when schemes disagree", () => {
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [{ productSlug: "micro-lap", minAmount: "1 crore" }, { productSlug: "micro-lap", maxAmount: "60 lakh" }] }, SLUGS);
    const p = mergeOffers(x.offers).policies[0]!;
    expect([p.minAmount, p.maxAmount]).toEqual([null, 6_000_000]);
  });
});


describe("programs and conditions read off a flyer", () => {
  const SL = new Set(["home-loan", "working-capital-term-loan", "machine-loan"]);
  const smfg = {
    kind: "LENDER_OFFER",
    summary: "SMFG Grihashakti programs",
    lenderName: "SMFG Grihashakti",
    offers: [
      { scheme: "Salaried Customer Program", productSlug: "home-loan", maxAmount: 3000000, maxTenureMonths: 240, minRate: 10.5, ltv: "80% (With Insurance: 85%)", who: "Cash salary cases considered, max cash salary 30,000" },
      { scheme: "ITR Program", productSlug: "home-loan", maxAmount: 10000000, maxTenureMonths: 240, minAge: 25, maxAge: 70, minVintageMonths: 36, who: "2 years regular ITR" },
      { scheme: "Low LTV Program", productSlug: "home-loan", maxAmount: 10000000, maxTenureMonths: 180, ltv: "Up to 50%" },
    ],
  };
  const jio = {
    kind: "LENDER_OFFER",
    lenderName: "Jio Credit",
    offers: [
      { scheme: "Term Loan (TL)", productSlug: "working-capital-term-loan", minAmount: 100000000, minTurnover: "50 Cr", maxTenureMonths: 60, foirPct: 0, conditions: { dscr: "1.2", guarantee: "PG/CG required", endUse: "Factory set up with plant and machinery", madeUp: "x" } },
      { scheme: "Unsecured Industrial Machinery Purchase", productSlug: "machine-loan", maxAmount: 100000000, maxTenureMonths: 60, conditions: { moratoriumMonths: 3, fundingPct: 85 } },
    ],
  };

  it("keeps every scheme of one loan type as a program with its own limits", () => {
    const [policy] = mergeOffers(normalizeExtraction(smfg, SL).offers).policies;
    expect(policy!.programs.map((p) => p.name)).toEqual(["Salaried Customer Program", "ITR Program", "Low LTV Program"]);
    expect(policy!.programs[1]).toMatchObject({ maxAmount: 10000000, minAge: 25, maxAge: 70, who: "2 years regular ITR" });
    expect(policy!.programs[2]).toMatchObject({ ltv: "Up to 50%", maxTenureMonths: 180 });
    // the loan type's own range still widens across them
    expect(policy).toMatchObject({ maxAmount: 10000000, maxTenureMonths: 240 });
    // only the ITR program states ages and vintage, so they are NOT said of the whole Home Loan; they stay on that program
    expect(policy).toMatchObject({ minAge: null, maxAge: null, minBusinessVintageMonths: null });
    expect(policy!.programs[1]).toMatchObject({ minAge: 25, maxAge: 70 });
  });

  it("makes no program list for a loan type with one scheme", () => {
    const policies = mergeOffers(normalizeExtraction(jio, SL).offers).policies;
    expect(policies.every((p) => p.programs.length === 0)).toBe(true);
  });

  it("reads turnover, FOIR and conditions, and drops anything unknown", () => {
    const tl = mergeOffers(normalizeExtraction(jio, SL).offers).policies.find((p) => p.productSlug === "working-capital-term-loan")!;
    expect(tl.minAnnualTurnover).toBe(500_000_000);
    expect(tl.foirPct).toBeNull(); // a printed 0 is not a limit
    expect(tl.conditions).toEqual({ dscr: 1.2, guarantee: "PG/CG required", endUse: "Factory set up with plant and machinery" });
    const machine = mergeOffers(normalizeExtraction(jio, SL).offers).policies.find((p) => p.productSlug === "machine-loan")!;
    expect(machine.conditions).toEqual({ moratoriumMonths: 3, fundingPct: 85 });
  });

  it("adds to a policy that exists without replacing anything", () => {
    const [draft] = mergeOffers(normalizeExtraction(smfg, SL).offers).policies;
    const have = {
      minAmount: null, maxAmount: 5000000, minRate: null, maxRate: null, minTenureMonths: null, maxTenureMonths: null, rateType: null, processingFee: null,
      specialScheme: null, employmentTypes: [], cities: [], gstRequired: false, allIndia: false, minCreditScore: null, notes: null,
      minAge: 21, maxAgeAtMaturity: null, minAnnualTurnover: null, minBusinessVintageMonths: null, hasFoir: true,
      programs: [cleanProgram({ name: "ITR Program", maxAmount: 8000000 })!],
      conditions: { rating: "A" },
    };
    const { fields, changes } = mergeIntoPolicy(have, { ...draft!, conditions: { rating: "BBB-", dscr: 1.2 }, foirPct: 60 }, "2026-11-17");
    const programs = fields.programs as { name: string; maxAmount: number | null; maxTenureMonths: number | null }[];
    expect(programs.find((p) => p.name === "ITR Program")).toMatchObject({ maxAmount: 8000000, maxTenureMonths: 240 }); // held amount kept, blank filled
    expect(programs.map((p) => p.name)).toEqual(expect.arrayContaining(["Salaried Customer Program", "Low LTV Program"]));
    expect(fields.conditions).toEqual({ rating: "A", dscr: 1.2 }); // the held rating is kept
    expect(fields.minAge).toBeUndefined(); // 25 would make the rule stricter than the 21 already held
    expect(fields.foirBands).toBeUndefined(); // FOIR already recorded
    expect(changes.join(" ")).toMatch(/programs added/);
  });
});


describe("figures the reader tends to leave in the notes or get wrong", () => {
  const SL = new Set(["working-capital-term-loan", "home-loan"]);
  it("reads a tenure written in the notes when no figure was given", () => {
    expect(tenureFromText("Max Tenure 5 yrs; DSCR 1.2x")).toBe(60);
    expect(tenureFromText("Banking program; tenure 20 years; max age 70")).toBe(240);
    expect(tenureFromText("Tenure: 15 Years")).toBe(180);
    expect(tenureFromText("tenure up to 18 months")).toBe(18);
    expect(tenureFromText("max age 70 years")).toBeNull();
    expect(tenureFromText("tenure 900 years")).toBeNull();
    expect(tenureFromText(null)).toBeNull();
  });
  it("uses that tenure for the scheme, but never over a figure the reader did give", () => {
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [
      { scheme: "TL", productSlug: "working-capital-term-loan", minAmount: 100000000, notes: "Max Tenure 5 yrs" },
      { scheme: "HL", productSlug: "home-loan", maxAmount: 3000000, maxTenureMonths: 240, notes: "tenure 15 years" },
    ] }, SL);
    expect(x.offers[0]!.maxTenureMonths).toBe(60);
    expect(x.offers[1]!.maxTenureMonths).toBe(240);
  });
  it("reads a turnover given with its unit exactly, so 50 Cr is 50 crore and not 500", () => {
    const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [{ scheme: "TL", productSlug: "working-capital-term-loan", minTurnover: "Rs 50 Cr", maxAmount: 1 }] }, SL);
    expect(x.offers[0]!.minTurnover).toBe(500_000_000);
  });
});


describe("a loan type with one open-ended scheme and one capped scheme", () => {
  const SL = new Set(["bill-discounting"]);
  const x = normalizeExtraction({ kind: "LENDER_OFFER", offers: [
    { scheme: "Sales Invoice Discounting", productSlug: "bill-discounting", minAmount: 100000000 },
    { scheme: "Unsecured PID", productSlug: "bill-discounting", maxAmount: 50000000 },
    { scheme: "Secured PID", productSlug: "bill-discounting", minAmount: 50000000 },
  ] }, SL);
  it("does not turn the capped scheme's limit into a ceiling for all of them", () => {
    const [policy] = mergeOffers(x.offers).policies;
    expect(policy!.maxAmount).toBeNull();
    // the unsecured scheme states no minimum, so none is claimed for the loan type
    expect(policy!.minAmount).toBeNull();
    // each program still holds its own figures
    expect(policy!.programs.find((p) => p.name === "Unsecured PID")!.maxAmount).toBe(50_000_000);
    expect(policy!.programs.find((p) => p.name === "Sales Invoice Discounting")!.minAmount).toBe(100_000_000);
  });
  it("still widens a ceiling when every scheme is capped", () => {
    const y = normalizeExtraction({ kind: "LENDER_OFFER", offers: [
      { scheme: "A", productSlug: "bill-discounting", maxAmount: 3000000 },
      { scheme: "B", productSlug: "bill-discounting", maxAmount: 10000000 },
    ] }, SL);
    expect(mergeOffers(y.offers).policies[0]!.maxAmount).toBe(10_000_000);
  });
});


describe("a requirement is said of the whole loan type only when every scheme states it", () => {
  const SL = new Set(["bill-discounting", "home-loan"]);
  const read = (offers: object[]) => mergeOffers(normalizeExtraction({ kind: "LENDER_OFFER", offers }, SL).offers).policies[0]!;

  it("keeps a turnover, age or vintage that only one scheme states on that scheme", () => {
    const p = read([
      { scheme: "Secured", productSlug: "bill-discounting", minAmount: 50000000, minTurnover: "50 Cr", minVintageMonths: 36, minAge: 25 },
      { scheme: "Unsecured", productSlug: "bill-discounting", maxAmount: 50000000 },
    ]);
    expect(p.minAnnualTurnover).toBeNull();
    expect(p.minBusinessVintageMonths).toBeNull();
    expect(p.minAge).toBeNull();
    expect(p.programs.map((x) => x.name)).toEqual(["Secured", "Unsecured"]);
  });

  it("states it, as the lowest, when every scheme does", () => {
    const p = read([
      { scheme: "A", productSlug: "bill-discounting", minAmount: 100000000, minTurnover: "50 Cr", minAge: 25 },
      { scheme: "B", productSlug: "bill-discounting", minAmount: 50000000, minTurnover: "75 Cr", minAge: 28 },
    ]);
    expect(p).toMatchObject({ minAmount: 50_000_000, minAnnualTurnover: 500_000_000, minAge: 25 });
  });

  it("says a condition of the loan type only when all schemes say it the same way, and keeps the rest on each program", () => {
    const p = read([
      { scheme: "Sales", productSlug: "bill-discounting", minAmount: 100000000, conditions: { sectors: "Sales only to Reliance group" } },
      { scheme: "Unsecured", productSlug: "bill-discounting", maxAmount: 50000000, conditions: { rating: "BBB- and above", chargeOnAssets: "Not required", guarantee: "PG/CG required" } },
      { scheme: "Secured", productSlug: "bill-discounting", minAmount: 50000000, conditions: { chargeOnAssets: "Required", guarantee: "PG/CG required" } },
    ]);
    // the rating belongs to one product, and the charge on assets differs: neither may be said of all three
    expect(p.conditions).toEqual({});
    const unsecured = p.programs.find((x) => x.name === "Unsecured")!;
    expect(unsecured.conditions).toContain("Minimum credit rating of the borrower: BBB- and above");
    expect(unsecured.conditions).toContain("Charge on current assets: Not required");
    expect(p.programs.find((x) => x.name === "Secured")!.conditions).toContain("Charge on current assets: Required");
  });

  it("still states a condition every scheme agrees on", () => {
    const p = read([
      { scheme: "A", productSlug: "bill-discounting", minAmount: 100, conditions: { guarantee: "PG/CG required" } },
      { scheme: "B", productSlug: "bill-discounting", minAmount: 200, conditions: { guarantee: "PG/CG required", rating: "A" } },
    ]);
    expect(p.conditions).toEqual({ guarantee: "PG/CG required" });
  });
});
