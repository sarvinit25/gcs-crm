import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LENDER_CONTACTS, NEW_LENDERS } from "../../prisma/lender-contacts-data";

const seedSource = readFileSync(join(__dirname, "../../prisma/seed.ts"), "utf8");
const seededLenders = [...seedSource.matchAll(/^\s*\["([^"]+)", LenderType\.(?:BANK|NBFC),/gm)].map((m) => m[1]);
const knownLenders = new Set([...seededLenders, ...NEW_LENDERS.map((l) => l.name)]);

describe("lender relationship-manager directory (from the client's sheet)", () => {
  it("is not empty and the seed's own lender list was readable", () => {
    expect(LENDER_CONTACTS.length).toBeGreaterThan(40);
    expect(seededLenders.length).toBeGreaterThan(30);
  });

  it("only refers to lenders that exist, either already seeded or added alongside", () => {
    const unknown = LENDER_CONTACTS.filter((c) => !knownLenders.has(c.lender)).map((c) => c.lender);
    expect([...new Set(unknown)]).toEqual([]);
  });

  it("adds no lender twice, and none that was already seeded", () => {
    const names = NEW_LENDERS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => seededLenders.includes(n))).toEqual([]);
  });

  it("holds clean phone numbers and emails", () => {
    for (const c of LENDER_CONTACTS) {
      if (c.phone) expect(c.phone).toMatch(/^\d{10}$/);
      if (c.email) expect(c.email).toMatch(/^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/);
      expect(c.name.trim().length).toBeGreaterThanOrEqual(2);
      expect(c.segments.length).toBeGreaterThan(0);
    }
  });

  it("lists nobody twice at the same lender", () => {
    const keys = LENDER_CONTACTS.map((c) => `${c.lender}|${c.phone ?? c.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps the questionable entries flagged for a human to confirm", () => {
    const note = (name: string) => LENDER_CONTACTS.find((c) => c.name === name)?.notes ?? "";
    expect(note("Manish Yadav")).toMatch(/doesn't match/); // email belongs to someone else
    expect(note("Sunny Gurbani")).toMatch(/mistyped/); // ",com" corrected
    expect(note("Asif Khan")).toMatch(/Personal email/);
    expect(note("Ajay Rawat")).toMatch(/No phone/);
  });

  it("merges a person listed under several loan types into one contact", () => {
    const tanmay = LENDER_CONTACTS.filter((c) => c.name === "Tanmay Dandekar");
    expect(tanmay).toHaveLength(1);
    expect(tanmay[0].segments.sort()).toEqual(["Business Loan", "Overdraft"]);
  });
});
