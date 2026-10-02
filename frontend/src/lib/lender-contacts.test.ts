import { describe, expect, it } from "vitest";
import { rankContacts, segmentsForProduct } from "./lender-contacts";

describe("segmentsForProduct", () => {
  it.each([
    ["Business Loan", ["Business Loan", "Small Business Loan"]],
    ["MSME Loan", ["Business Loan", "Small Business Loan"]],
    ["Machinery Loan", ["Machinery Loan"]],
    ["Working Capital Loan", ["Overdraft"]],
    ["Loan Against Property", ["Secured Loan", "Loan Against Property"]],
    ["Home Loan", ["Secured Loan", "Home Loan"]],
    ["Personal Loan", ["Personal Loan"]],
  ])("%s → %j", (name, expected) => expect(segmentsForProduct(name).sort()).toEqual([...expected].sort()));

  it("matches nothing for an unknown product or no product", () => {
    expect(segmentsForProduct("Education Loan")).toEqual([]);
    expect(segmentsForProduct(null)).toEqual([]);
    expect(segmentsForProduct(undefined)).toEqual([]);
  });
});

describe("rankContacts", () => {
  const people = [
    { name: "Zed", segments: ["Overdraft"] },
    { name: "Amy", segments: ["Secured Loan"] },
    { name: "Bob", segments: ["Business Loan"] },
    { name: "Cal", segments: ["Small Business Loan", "Overdraft"] },
  ];

  it("puts the people who handle this loan type first, each group alphabetical", () => {
    const ranked = rankContacts(people, "Business Loan");
    expect(ranked.map((r) => r.contact.name)).toEqual(["Bob", "Cal", "Amy", "Zed"]);
    expect(ranked.map((r) => r.relevant)).toEqual([true, true, false, false]);
  });

  it("falls back to plain alphabetical when the product says nothing", () => {
    expect(rankContacts(people, "Education Loan").map((r) => r.contact.name)).toEqual(["Amy", "Bob", "Cal", "Zed"]);
  });
});
