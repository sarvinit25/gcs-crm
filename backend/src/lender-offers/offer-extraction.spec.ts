import { bestLender, cleanPhone, mergeOffers, offerEnded, normalizeExtraction, toRupees } from "./offer-extraction";

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

import { fillContact, mergeIntoPolicy, normalizedForHash, type ExistingPolicy, type PolicyDraft } from "./offer-extraction";

const held = (over: Partial<ExistingPolicy> = {}): ExistingPolicy => ({
  minAmount: 300_000, maxAmount: 2_000_000, minRate: 19, maxRate: 24, minTenureMonths: 12, maxTenureMonths: 120, rateType: null, processingFee: null,
  specialScheme: "Quasi, Property Power", employmentTypes: ["Salaried"], cities: ["Mumbai"], gstRequired: false, allIndia: false, minCreditScore: null, notes: null, ...over,
});
const flyer = (over: Partial<PolicyDraft> = {}): PolicyDraft => ({
  productSlug: "micro-lap", minAmount: 300_000, maxAmount: 2_000_000, minRate: 19, maxRate: 24, minTenureMonths: 12, maxTenureMonths: 120, rateType: null, processingFee: null,
  specialScheme: "Quasi, Property Power", employmentTypes: ["Salaried"], gstRequired: false, minCreditScore: null, allIndia: false, cities: ["Mumbai"], notes: "turnaround 4 days", schemes: 2, ...over,
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
