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
    expect(names).toEqual(["Summary", "Applicant", "Income", "Income programs", "Obligations", "Eligibility", "Banking", "Property", "Assets & net worth", "Scorecard", "Checks & documents", "Lender match", "Risks & recommendation", "Missing information"]);
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

// A fuller business case in the shape of the lender-style CAM sheets we were given.
const full: CamData = {
  applicant: { fullName: "Rushikesh Vyas", dob: "1962-09-05", city: "Mumbai" },
  loanRequest: {
    amount: 2_500_000, tenureYears: 10,
    coApplicants: [{ name: "Ronak Vyas", relation: "Son", dob: "1992-01-27", monthlyIncome: 40000, emi: 5000, cibil: 640 }],
  },
  income: {
    profile: "Self-employed business", industry: "Trading", vintageYears: 10, rentalIncome: 90000, agriIncome: 120000, projectedSales: 12_000_000, projectedMarginPct: 8, existingWcLimit: 500000,
    financials: [
      { year: "2025-26", turnover: 10_000_000, grossProfit: 2_000_000, netProfit: 700_000, depreciation: 100_000, interestPaid: 150_000, remuneration: 200_000, tax: 50_000 },
      { year: "2024-25", turnover: 8_000_000, grossProfit: 1_500_000, netProfit: 400_000, depreciation: 80_000 },
    ],
    balanceSheet: [{ year: "2025-26", netWorth: 2_000_000, bankDebt: 1_000_000, highCostDebt: 500_000, currentAssets: 3_000_000, currentLiabilities: 2_000_000, debtors: 1_000_000, inventory: 500_000, creditors: 400_000 }],
  },
  obligations: { cibilScore: 720, loans: [{ lender: "Magma", emi: 9257, outstanding: 339949, foir: "Yes", status: "Live", bounces: 1, dpd30: 2 }, { lender: "Old", emi: 3000, outstanding: 10000, status: "Closed" }, { lender: "Swap", emi: 4000, outstanding: 80000, status: "Will be closed from this loan" }] },
  banking: { months: Array.from({ length: 12 }, (_, i) => ({ month: `m${i}`, credits: i < 6 ? 500_000 : 700_000 })) },
  bankingDetail: { bankName: "Bandhan", detail: [{ month: "Dec", bal5: 20000, bal10: 40000, bal15: 60000, bal25: 80000, emisSeen: 30000, debitCount: 100, creditCount: 50, inward: 2, outward: 1 }, { month: "Nov", bal5: 100000, bal10: 100000, bal15: 100000, bal25: 100000, emisSeen: 30000, debitCount: 100, creditCount: 50, inward: 0, outward: 0 }] },
  property: { agreementValue: 6_000_000, marketValue: 6_500_000, ageYears: 10 },
  valuation: { valuer1: "A", valuer1Value: 5_800_000, valuer2: "B", valuer2Value: 5_500_000, approvedPlan: "No" },
  checks: { fiResidence: "Positive", tvr: "Negative", rcu: "Clear", sustainability: "Concern" },
  documents: { list: [{ document: "PAN card", who: "Rushikesh", status: "Received" }, { document: "Valuation report", status: "Pending" }] },
  remarks: { deviationList: [{ deviation: "Age above 60", level: "High", mitigant: "Son is co-applicant" }] },
};

describe("what the lender-style sheets add", () => {
  const a = analyse("LAP", full, new Date("2026-11-10T00:00:00Z"));
  it("adds co-applicants' income and EMIs, and watches the weakest score and the oldest age", () => {
    expect(a.coApplicants).toMatchObject({ count: 1, income: 40000, emi: 5000, lowestCibil: 640 });
    expect(a.coApplicants.oldestAgeAtMaturity).toBe(74); // 64 now, 10 years of loan
    expect(a.flags.some((f) => /co-applicant's CIBIL score is 640/.test(f.text))).toBe(true);
  });
  it("shows every income program and takes cash profit unless told otherwise", () => {
    const by = Object.fromEntries(a.programs.map((p) => [p.key, p.annual]));
    expect(by.cash).toBe(1_150_000); // 700k + 100k + 150k + 200k
    // 700k is 1.75 times the 400k before, so net profit is averaged to 550k; depreciation 100k against 80k is not a jump
    expect(by.net).toBe(550_000 + 100_000 + 200_000);
    expect(by.gross).toBe(1_500_000); // the margin is capped at 15% of 10M, below the actual 20%
    expect(a.program.chosen).toMatch(/Cash profit/);
    expect(a.program.highest).toMatch(/Gross margin/); // 1.5M is above the 1.15M of cash profit
  });
  it("counts rent only up to the main income and half the farm income", () => {
    // 1,150,000 / 12 + 90,000 rent (under the main income) + 5,000 (half of 120,000 over 12) + 40,000 co-applicant
    expect(a.monthlyIncome).toBe(Math.round(1_150_000 / 12 + 90_000 + 5_000 + 40_000));
  });
  it("takes the lender's valuers over the customer, and gives the loan-to-value both ways", () => {
    expect(a.property.marketValue).toBe(5_500_000);
    expect(a.property.value).toBe(5_500_000);
    expect(a.property.ltvOnCost).toBeCloseTo(41.7, 1);
    expect(a.property.ltvOnMarket).toBeCloseTo(45.5, 1);
  });
  it("ignores closed and to-be-closed loans in the repayment, and counts the track", () => {
    expect(a.existingEmi).toBe(9257 + 5000); // Magma and the co-applicant; the other two are not counted
    expect(a.tracks).toMatchObject({ bounces: 1, dpd30: 2 });
  });
  it("works the average balance from four dates a month and catches a missing loan", () => {
    expect(a.bankingDetail.abb).toBe((50000 + 100000) / 2);
    expect(a.bankingDetail.inwardPct).toBe(1);
    expect(a.flags.some((f) => /a loan may be missing/.test(f.text))).toBe(true);
  });
  it("offers the banking program and the double-whammy check for a loan against property", () => {
    expect(a.bankingProgram).not.toBeNull();
    expect(a.bankingProgram!.maxFoirPct).toBeCloseTo(130 - (a.property.ltv as number), 1);
    expect(a.doubleWhammy!.limit).toBe(130);
  });
  it("reads the balance sheet and the working-capital limit", () => {
    expect(a.ratios.currentRatio).toBe(1.5);
    expect(a.ratios.debtorDays).toBe(37); // 1M of 10M, over 365
    expect(a.ratios.highCostDebtPct).toBeCloseTo(33.3, 1);
    expect(a.ratios.debtEquityAfter).toBe(2); // (1M + 0.5M + 2.5M) / 2M
    expect(a.workingCapital).toMatchObject({ limit: 3_000_000, bankFinance: 2_400_000, existing: 500000, headroom: 1_900_000 });
    expect(a.ratios.projectedDscr).not.toBeNull();
  });
  it("raises a negative check as a risk and scores the case", () => {
    expect(a.flags.some((f) => f.level === "risk" && /Telephone verification: Negative/.test(f.text))).toBe(true);
    expect(a.scorecard.items.length).toBeGreaterThan(5);
    expect(a.scorecard.grade).toMatch(/^[A-F]$/);
    expect(a.scorecard.percent).toBeGreaterThanOrEqual(0);
    expect(a.scorecard.percent).toBeLessThanOrEqual(100);
  });
  it("lets staff pick another income program", () => {
    const net = analyse("LAP", { ...full, remarks: { ...full.remarks, incomeProgram: "Net profit program" } });
    expect(net.program.chosen).toMatch(/Net profit/);
    expect(net.monthlyIncome).toBeLessThan(a.monthlyIncome as number);
  });
  it("gives no score until three tests have an answer", () => {
    expect(analyse("HOME", { obligations: { cibilScore: 780 } }).scorecard.percent).toBeNull();
  });
  it("writes the new sheets and the pending documents", async () => {
    const buf = await buildCamWorkbook({
      lead: { leadNo: 9, name: "Rushikesh Vyas", phone: "9876543210", email: null, city: "Mumbai", productName: "Loan Against Property", source: null },
      family: "LAP", data: full, analysis: a, match: null, matchNote: "none", company: { name: "GCS", phone: "", email: "" }, generatedBy: "x", generatedAt: "now", customerSubmittedAt: null,
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    for (const n of ["Income programs", "Financial analysis", "Scorecard", "Checks & documents"]) expect(names).toContain(n);
    const text = (name: string) => { const out: string[] = []; wb.getWorksheet(name)!.eachRow((row) => row.eachCell((c) => out.push(String(typeof c.value === "object" && c.value && "result" in c.value ? (c.value as { result: unknown }).result : c.value)))); return out.join("|"); };
    expect(text("Missing information")).toContain("Valuation report");
    expect(text("Checks & documents")).toContain("Age above 60");
    expect(text("Income programs")).toContain("Banking program");
    expect(text("Scorecard")).toContain("Total");
    let formulas = 0;
    wb.getWorksheet("Income programs")!.eachRow((row) => row.eachCell((c) => { const v = c.value as { formula?: string } | null; if (v && typeof v === "object" && "formula" in v) formulas += 1; }));
    expect(formulas).toBeGreaterThan(5);
  });
});
