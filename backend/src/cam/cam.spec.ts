import ExcelJS from "exceljs";
import { analyse, ageOn } from "./cam-analysis";
import { buildCamWorkbook } from "./cam-workbook";
import { cleanSectionPatch, cleanValue, familyOfSlug, mergePatch, missingCore, progress, SECTION_BY_ID, sectionsFor, visible, type CamData } from "./cam-schema";
import { prefillFromLead, withPrefill } from "./cam.service";

describe("which family a loan type belongs to", () => {
  it("maps CRM slugs", () => {
    expect(familyOfSlug("home-loan")).toBe("HOME");
    expect(familyOfSlug("balance-transfer")).toBe("HOME");
    expect(familyOfSlug("loan-against-property")).toBe("LAP");
    expect(familyOfSlug("micro-lap")).toBe("LAP");
    expect(familyOfSlug("business-loan")).toBe("BUSINESS");
    expect(familyOfSlug("cash-credit")).toBe("BUSINESS");
    expect(familyOfSlug("education-loan")).toBe("EDUCATION");
    expect(familyOfSlug("new-car-loan")).toBe("OTHER");
    expect(familyOfSlug(null)).toBe("OTHER");
  });
  it("gives each family its own sections", () => {
    const ids = (f: Parameters<typeof sectionsFor>[0]) => sectionsFor(f).map((s) => s.id);
    expect(ids("EDUCATION")).toContain("education");
    expect(ids("EDUCATION")).not.toContain("property");
    expect(ids("HOME")).toContain("property");
    expect(ids("HOME")).not.toContain("education");
    expect(sectionsFor("HOME", true).map((s) => s.id)).not.toContain("remarks");
    expect(ids("HOME")).toContain("remarks");
  });
});

describe("cleaning what comes in", () => {
  it("cleans each type", () => {
    expect(cleanValue("money", "12,50,000")).toBe(1_250_000);
    expect(cleanValue("money", "-5")).toBeNull();
    expect(cleanValue("money", "abc")).toBeNull();
    expect(cleanValue("percent", 140)).toBeNull();
    expect(cleanValue("date", "2026-02-31")).toBeNull();
    expect(cleanValue("date", "1990-05-17")).toBe("1990-05-17");
    expect(cleanValue("select", "Nope", ["A", "B"])).toBeNull();
    expect(cleanValue("yesno", "Yes")).toBe("Yes");
    expect(cleanValue("yesno", "maybe")).toBeNull();
    expect(cleanValue("phone", "+91 98765 43210")).toBe("9876543210");
    expect(cleanValue("email", "Not an email")).toBeNull();
    expect(cleanValue("text", "  hello  ")).toBe("hello");
  });
  it("drops unknown keys and cuts tables to their limit", () => {
    const s = SECTION_BY_ID.get("obligations")!;
    const rows = Array.from({ length: 30 }, (_, i) => ({ lender: `L${i}`, emi: 1000, evil: "x" }));
    const out = cleanSectionPatch(s, { cibilScore: "745", hack: "x", loans: rows });
    expect(out.cibilScore).toBe(745);
    expect("hack" in out).toBe(false);
    expect((out.loans as unknown[]).length).toBe(12);
    expect("evil" in ((out.loans as Record<string, unknown>[])[0] as object)).toBe(false);
  });
  it("lets the customer change only customer sections", () => {
    const stored: CamData = { remarks: { recommendation: "Proceed" } };
    const next = mergePatch(stored, { remarks: { recommendation: "Not recommended" }, applicant: { fullName: "Asha" } }, sectionsFor("HOME", true));
    expect(next.remarks!.recommendation).toBe("Proceed");
    expect(next.applicant!.fullName).toBe("Asha");
  });
});

describe("what shows depends on earlier answers", () => {
  it("shows salaried questions only to the salaried", () => {
    const f = SECTION_BY_ID.get("income")!.fields.find((x) => x.key === "employer")!;
    expect(visible(f.show, { income: { profile: "Salaried" } })).toBe(true);
    expect(visible(f.show, { income: { profile: "Self-employed business" } })).toBe(false);
    expect(visible(f.show, {})).toBe(false);
  });
  it("lists missing core answers and tracks progress", () => {
    const empty = missingCore("HOME", {});
    expect(empty.length).toBeGreaterThan(5);
    const some: CamData = { applicant: { fullName: "Asha", pan: "ABCDE1234F" } };
    expect(missingCore("HOME", some).length).toBeLessThan(empty.length);
    expect(progress("HOME", {})).toBe(0);
    expect(progress("HOME", some)).toBeGreaterThan(0);
  });
});

describe("prefilling from the lead", () => {
  const lead = { name: "Asha Rao", phone: "9876543210", secondaryPhone: null, email: "a@x.in", city: "Thane", amount: 2_500_000, dateOfBirth: new Date("1990-05-17T00:00:00Z"), pan: null, address: null, pincode: null, employmentType: "SALARIED", monthlyIncome: 80000, employerName: "Acme", designation: "Manager", experienceYears: 8 } as never;
  it("carries over what the lead already knows, and stored answers win", () => {
    const p = prefillFromLead(lead);
    expect(p.applicant!.fullName).toBe("Asha Rao");
    expect(p.applicant!.dob).toBe("1990-05-17");
    expect(p.income!.profile).toBe("Salaried");
    const merged = withPrefill(p, { applicant: { fullName: "Asha R. Rao", city: "" } });
    expect(merged.applicant!.fullName).toBe("Asha R. Rao");
    expect(merged.applicant!.city).toBe("Thane");
  });
});

const salaried: CamData = {
  applicant: { fullName: "Asha Rao", dob: "1990-05-17", city: "Thane" },
  loanRequest: { amount: 5_000_000, tenureYears: 20 },
  income: { profile: "Salaried", netMonthly: 150000, otherIncome: 10000 },
  obligations: { cibilScore: 780, cardOutstanding: 20000, loans: [{ lender: "HDFC", emi: 10000, outstanding: 300000, foir: "Yes" }, { lender: "Old", emi: 4000, foir: "No" }] },
  banking: { emiBounces: 0, months: [{ month: "Oct", credits: 160000, debits: 120000, avgBalance: 90000 }, { month: "Sep", credits: 150000, debits: 100000, avgBalance: 70000 }] },
  property: { agreementValue: 7_000_000, marketValue: 7_500_000 },
  assets: { assets: [{ type: "Fixed deposit", value: 500000 }] },
};

describe("the arithmetic of a CAM", () => {
  const a = analyse("HOME", salaried, new Date("2026-11-10T00:00:00Z"));
  it("takes income, running EMIs and card dues the way it says", () => {
    expect(a.monthlyIncome).toBe(155000); // 150000 + half of 10000
    expect(a.cardObligation).toBe(1000); // 5% of 20000
    expect(a.existingEmi).toBe(11000); // 10000 counted, 4000 not counted, plus the card obligation
  });
  it("works out the EMI, the repayment ratio and what the income supports", () => {
    expect(a.rate).toBe(9.5);
    expect(a.rateIsAssumed).toBe(true);
    expect(a.proposedEmi).toBeGreaterThan(45000);
    expect(a.proposedEmi).toBeLessThan(50000);
    expect(a.foirAfter).toBeGreaterThan(30);
    expect(a.foirAfter).toBeLessThan(45);
    expect(a.eligible).toBeGreaterThan(5_000_000);
  });
  it("reads banking, property and net worth", () => {
    expect(a.banking.avgCredits12).toBe(155000);
    expect(a.banking.abbToEmi).toBeGreaterThan(1);
    expect(a.property.value).toBe(7_000_000); // the lower of the two
    expect(a.property.ltv).toBeCloseTo(71.4, 1);
    expect(a.netWorth).toEqual({ assets: 500000, liabilities: 320000, net: 180000 });
    expect(a.age).toBe(36);
  });
  it("raises no risk flag for a clean case and a good one for the score", () => {
    expect(a.flags.some((f) => f.level === "risk")).toBe(false);
    expect(a.flags.some((f) => f.level === "good" && /CIBIL/.test(f.text))).toBe(true);
  });
  it("flags a weak case", () => {
    const weak = analyse("HOME", { ...salaried, obligations: { cibilScore: 610, overdue: "Yes", loans: [{ emi: 70000, foir: "Yes" }] }, banking: { emiBounces: 4 } });
    const text = weak.flags.map((f) => f.text).join("|");
    expect(text).toMatch(/below 650/);
    expect(text).toMatch(/missed or overdue/);
    expect(text).toMatch(/above the 55% ceiling/);
    expect(text).toMatch(/4 cheque or EMI returns/);
  });
  it("uses a staff rate and ceiling when given", () => {
    const b = analyse("HOME", { ...salaried, remarks: { assumedRate: 8.5, foirCeiling: 60 } });
    expect(b.rate).toBe(8.5);
    expect(b.rateIsAssumed).toBe(false);
    expect(b.foirCeiling).toBe(60);
  });
  it("takes a business's income from cash profit and checks GST against the declared turnover", () => {
    const biz: CamData = {
      applicant: { dob: "1980-01-01" },
      loanRequest: { amount: 3_000_000, tenureYears: 4 },
      income: { profile: "Self-employed business", vintageYears: 1, financials: [{ year: "2025-26", turnover: 12_000_000, netProfit: 1_200_000, depreciation: 100_000, interestPaid: 200_000, remuneration: 300_000 }, { year: "2024-25", turnover: 10_000_000, netProfit: 900_000 }] },
      gst: { months: Array.from({ length: 12 }, (_, i) => ({ month: `m${i}`, sales: i < 6 ? 600_000 : 1_200_000 })) },
    };
    const r = analyse("BUSINESS", biz);
    expect(r.monthlyIncome).toBe(150000); // (12L + 1L + 2L + 3L) / 12
    expect(r.financials[0]!.growth).toBe(20);
    expect(r.gst.avg).toBe(900000);
    expect(r.gst.trendPct).toBe(-50);
    expect(r.gst.varianceVsDeclared).toBe(-10); // 10.8M a year against 12M
    expect(r.flags.some((f) => /Only 1 year/.test(f.text))).toBe(true);
    expect(r.flags.some((f) => /GST sales fell/.test(f.text))).toBe(true);
  });
  it("reads an age correctly around a birthday", () => {
    expect(ageOn("1990-11-11", new Date("2026-11-10T00:00:00Z"))).toBe(35);
    expect(ageOn("1990-11-10", new Date("2026-11-10T00:00:00Z"))).toBe(36);
    expect(ageOn("nonsense", new Date())).toBeNull();
  });
});

describe("the Excel CAM", () => {
  it("builds every sheet for a home loan, with live formulas on the eligibility sheet", async () => {
    const analysis = analyse("HOME", salaried);
    const buf = await buildCamWorkbook({
      lead: { leadNo: 7, name: "Asha Rao", phone: "9876543210", email: null, city: "Thane", productName: "Home Loan", source: "website" },
      family: "HOME",
      data: salaried,
      analysis,
      match: [{ lender: "Test Bank", status: "STRONG", score: 88, reasons: "✓ Amount fits", checks: "Confirm income" }],
      matchNote: null,
      company: { name: "GCS", phone: "1", email: "a@b.in" },
      generatedBy: "Mahesh",
      generatedAt: "10 Nov 2026",
      customerSubmittedAt: null,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(["Summary", "Applicant", "Income", "Obligations", "Eligibility", "Banking", "Property", "Assets & net worth", "Lender match", "Risks & recommendation", "Missing information"]);
    expect(names).not.toContain("Education");
    const elig = wb.getWorksheet("Eligibility")!;
    const formulas: string[] = [];
    elig.eachRow((row) => row.eachCell((c) => { const v = c.value as { formula?: string } | null; if (v && typeof v === "object" && "formula" in v && v.formula) formulas.push(v.formula); }));
    expect(formulas.some((f) => f.includes("PMT("))).toBe(true);
    expect(formulas.some((f) => f.includes("PV("))).toBe(true);
    const summary = wb.getWorksheet("Summary")!;
    let found = false;
    summary.eachRow((row) => { if (row.getCell(1).value === "Loan asked for") { found = true; expect(row.getCell(2).value).toBe(5_000_000); } });
    expect(found).toBe(true);
    expect(wb.getWorksheet("Lender match")!.getCell(5, 1).value).toBe("Test Bank");
  });
  it("adds the education sheet and leaves property out for an education loan", async () => {
    const data: CamData = { loanRequest: { amount: 2_000_000, coApplicantIncome: 90000 }, education: { studentName: "Kiran", tuition: 1_800_000, living: 600_000, scholarship: 200_000, ownContribution: 300_000 } };
    const buf = await buildCamWorkbook({
      lead: { leadNo: 8, name: "Kiran", phone: "9876543210", email: null, city: null, productName: null, source: null },
      family: "EDUCATION", data, analysis: analyse("EDUCATION", data), match: null, matchNote: "No lender rules yet", company: { name: "GCS", phone: "", email: "" }, generatedBy: "x", generatedAt: "now", customerSubmittedAt: null,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain("Education");
    expect(names).not.toContain("Property");
    let gap = 0;
    wb.getWorksheet("Education")!.eachRow((row) => { if (row.getCell(1).value === "Loan needed to close the gap") gap = row.getCell(2).value as number; });
    expect(gap).toBe(1_900_000); // 2.4M cost less 200k scholarship less 300k contribution
  });
});
