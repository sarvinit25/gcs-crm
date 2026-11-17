import { askReply, caLegalIntent, handoffReply, hasEnoughDetail, looksLikeLoanTalk } from "./ca-legal";

const cats = (t: string) => caLegalIntent(t)?.categories ?? null;

describe("recognising a CA or legal enquiry", () => {
  it("picks out the service people really ask for", () => {
    expect(cats("I need GST registration for my shop")).toEqual(["GST & Compliance"]);
    expect(cats("can you file my ITR")).toEqual(["Tax & Income Tax"]);
    expect(cats("need a rent agreement drafted")).toEqual(["Legal Drafting"]);
    expect(cats("do a title search on a flat in Thane")).toEqual(["Property Legal Services"]);
    expect(cats("udyam registration and trademark")).toEqual(["Business Registration"]);
    expect(cats("society NOC for flat transfer")).toEqual(["Housing Society Services"]);
    expect(cats("our building redevelopment papers")).toEqual(["Redevelopment"]);
    expect(cats("I want to make a will")).toEqual(["NRI & Family Property Services"]);
    expect(cats("do you have a lawyer or CA?")).toEqual(["CA & Legal"]);
    expect(cats("legal services price?")).toEqual(["CA & Legal"]);
  });

  it("says more than one when the message does", () => {
    expect(cats("GST returns and ITR filing both")).toEqual(["Tax & Income Tax", "GST & Compliance"]);
  });

  it("leaves ordinary loan talk to the loan assistant", () => {
    expect(cats("I want a home loan of 40 lakh")).toBeNull();
    expect(cats("what is the interest rate on loan against property")).toBeNull();
    expect(cats("legal and valuation charges on my home loan")).toBeNull();
    expect(cats("loan agreement copy needed")).toBeNull();
    expect(cats("is audit report needed for business loan")).toBeNull();
    expect(cats("which documents are required for a loan, GST returns and ITR")).toBeNull();
    expect(cats("hello")).toBeNull();
    expect(cats("will you call me tomorrow")).toBeNull();
  });

  it("still takes a clear service request even if a loan word is nearby", () => {
    expect(cats("I need a lawyer for my loan property papers")).toEqual(["CA & Legal"]);
    expect(cats("GST registration, and later I may want a business loan")).toEqual(["GST & Compliance"]);
  });

  it("tells loan talk from a CA/legal reply", () => {
    expect(looksLikeLoanTalk("I want a personal loan")).toBe(true);
    expect(looksLikeLoanTalk("GST registration please")).toBe(false);
    expect(looksLikeLoanTalk("ok")).toBe(false);
  });
});

describe("what is said back", () => {
  it("answers without a price and points to the CA & Legal page", () => {
    const r = askReply(["GST & Compliance"]);
    expect(r).toContain("GST & Compliance");
    expect(r).toContain("single point of contact");
    expect(r).toContain("in writing before you go ahead");
    expect(r).toContain("https://growthcapitalservices.in/ca-legal-services");
    expect(r).not.toMatch(/₹|\brs\.?\s*\d|starts? (at|from)/i);
  });
  it("joins several services naturally and hands over", () => {
    expect(askReply(["Tax & Income Tax", "GST & Compliance"])).toContain("Tax & Income Tax and GST & Compliance");
    expect(handoffReply(["Legal Drafting"])).toMatch(/passed this to our CA and legal team \(Legal Drafting\)/);
    expect(handoffReply(null)).toMatch(/message or call you here shortly/);
    expect(handoffReply(null)).toMatch(/documents, photos or a video/);
  });
  it("only skips the question when the message already says enough", () => {
    expect(hasEnoughDetail("I need GST registration for my small shop in Thane")).toBe(true);
    expect(hasEnoughDetail("GST registration")).toBe(false);
  });
});
