import { readFileSync } from "node:fs";
import { join } from "node:path";

type Dir = {
  lenders: { name: string; type: string }[];
  contacts: { lender: string; name: string; phone?: string; altPhone?: string; email?: string; kind?: string; city?: string; escalation?: { name: string }[] }[];
  codes: { lender: string; product: string; code?: string; payoutPercent?: number; payoutText?: string }[];
  branches: { lender: string; name: string }[];
};
const dir: Dir = JSON.parse(readFileSync(join(__dirname, "../../prisma/lender-directory-data.json"), "utf8"));
const lenderNames = new Set(dir.lenders.map((l) => l.name));

describe("lender directory (from the client's banker, SPOC and payout workbooks)", () => {
  it("is substantial", () => {
    expect(dir.contacts.length).toBeGreaterThan(4000);
    expect(dir.lenders.length).toBeGreaterThan(100);
    expect(dir.codes.length).toBe(20);
    expect(dir.branches.length).toBeGreaterThan(700);
  });

  it("only refers to lenders it lists, each listed once", () => {
    expect(lenderNames.size).toBe(dir.lenders.length);
    for (const row of [...dir.contacts, ...dir.codes, ...dir.branches]) expect(lenderNames).toContain(row.lender);
    expect(dir.lenders.every((l) => l.type === "BANK" || l.type === "NBFC")).toBe(true);
  });

  it("keeps the lenders already in the CRM under their existing names (no near-duplicates)", () => {
    for (const n of ["HDFC Bank", "ICICI Bank", "Cholamandalam", "PNB Housing", "Kotak Mahindra", "Fullerton India", "Aadhar Housing", "Bank of India"]) {
      expect(lenderNames).toContain(n);
    }
    for (const dup of ["Chola", "PNB Housing Finance", "HDFC", "ICICI", "KreditBee", "Bank Of India"]) expect(lenderNames).not.toContain(dup);
  });

  it("holds clean numbers and e-mails, and none of the incomplete ones (ending 000000)", () => {
    for (const c of dir.contacts) {
      for (const p of [c.phone, c.altPhone]) if (p) { expect(p).toMatch(/^[6-9]\d{9}$/); expect(p.endsWith("000000")).toBe(false); }
      if (c.email) expect(c.email).toMatch(/^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/);
      expect(c.name.trim().length).toBeGreaterThanOrEqual(2);
      expect(c.name).not.toMatch(/^TBR\b/);
    }
  });

  it("lists nobody twice at the same lender", () => {
    const seen = new Set<string>();
    for (const c of dir.contacts) {
      if (!c.phone) continue;
      const k = `${c.lender}|${c.phone}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it("carries the payout figures exactly as the workbook states them", () => {
    const find = (lender: string, product: string) => dir.codes.find((c) => c.lender === lender && c.product === product);
    expect(find("ICICI Bank", "New Car Loan")).toMatchObject({ code: "250115", payoutPercent: 1 });
    expect(find("Credila", "Educational Loan")).toMatchObject({ payoutPercent: 1.1 });
    expect(find("Poonawalla Fincorp", "Machinery loan")).toMatchObject({ payoutPercent: 1.25 });
    expect(find("IDFC First Bank", "Used Car Loan")).toMatchObject({ payoutText: "SLAB WISE PAYOUT" });
  });

  it("keeps the escalation chain for people on hierarchical lists", () => {
    const prince = dir.contacts.find((c) => c.name === "Prince Malhotra");
    expect(prince?.escalation?.map((e) => e.name)).toEqual(["Suneel Yadav", "Ravi Harjai"]);
  });
});
