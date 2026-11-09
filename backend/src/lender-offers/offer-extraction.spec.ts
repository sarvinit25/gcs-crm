import { bestLender, cleanPhone, mergeOffers, normalizeExtraction, toRupees } from "./offer-extraction";

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

describe("forwarding to the WhatsApp number", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { looksLikeOffer } = jest.requireActual("../whatsapp/inbound.service");
  it("picks up a message marked as an offer, or one long enough to be a flyer", () => {
    expect(looksLikeOffer("offer: Manba Finance micro LAP 19% to 24%")).toBe(true);
    expect(looksLikeOffer("Flyer - bridge funding 10 lacs to 50 crs")).toBe(true);
    expect(looksLikeOffer("x".repeat(400))).toBe(true);
  });
  it("leaves an ordinary question for the assistant", () => {
    expect(looksLikeOffer("How many active files?")).toBe(false);
    expect(looksLikeOffer("Aaj kitne follow-ups due hain?")).toBe(false);
    expect(looksLikeOffer("this is not an offerletter")).toBe(false);
  });
});
