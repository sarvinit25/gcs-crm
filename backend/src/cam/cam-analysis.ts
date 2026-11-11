import { dscr, emi, foir, loanForEmi, ltv, roomForEmi } from "../credit-evaluation/credit-calcs";
import type { CamData, Family } from "./cam-schema";

// The arithmetic of a CAM, kept apart from the Excel file so each number can be checked by itself. Nothing here decides a
// loan: it works out the figures an analyst reads, using stated assumptions, and raises flags for a person to look at.

/** Starting assumptions by loan family; staff can override the rate and the ceiling on the form (and in the workbook). */
export const DEFAULTS: Record<Family, { rate: number; foirCeiling: number; tenureMonths: number }> = {
  HOME: { rate: 9.5, foirCeiling: 55, tenureMonths: 240 },
  LAP: { rate: 10.5, foirCeiling: 65, tenureMonths: 180 },
  BUSINESS: { rate: 16, foirCeiling: 60, tenureMonths: 48 },
  EDUCATION: { rate: 11, foirCeiling: 50, tenureMonths: 120 },
  OTHER: { rate: 12, foirCeiling: 55, tenureMonths: 60 },
};

export type Flag = { level: "risk" | "watch" | "good"; text: string };

export type FinancialYear = {
  year: string;
  turnover: number | null;
  netProfit: number | null;
  margin: number | null;
  cashProfit: number | null;
  growth: number | null;
};

export type Analysis = {
  profile: "SALARIED" | "SELF_EMPLOYED" | null;
  incomeBasis: string;
  monthlyIncome: number | null;
  /** Monthly EMIs of running loans the applicant says count, plus 5% of card dues. */
  existingEmi: number;
  cardObligation: number;
  rate: number;
  rateIsAssumed: boolean;
  tenureMonths: number;
  foirCeiling: number;
  ceilingIsAssumed: boolean;
  requested: number | null;
  proposedEmi: number | null;
  foirAfter: number | null;
  room: number;
  eligible: number | null;
  financials: FinancialYear[];
  dscr: number | null;
  banking: {
    months: number;
    avgCredits6: number | null;
    avgCredits12: number | null;
    avgDebits12: number | null;
    avgBalance: number | null;
    returns: number;
    abbToEmi: number | null;
  };
  gst: { months: number; total: number; avg: number | null; trendPct: number | null; annualised: number | null; varianceVsDeclared: number | null; creditsToSales: number | null };
  property: { value: number | null; basis: string; ltv: number | null };
  netWorth: { assets: number; liabilities: number; net: number };
  cibil: number | null;
  age: number | null;
  flags: Flag[];
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
const avg = (xs: (number | null)[]) => {
  const k = xs.filter((x): x is number => x !== null);
  return k.length ? k.reduce((a, b) => a + b, 0) / k.length : null;
};
const rows = (data: CamData, section: string, table: string) => ((data[section]?.[table] as Record<string, unknown>[] | undefined) ?? []).filter(Boolean);
const rnd = (n: number | null, d = 0) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

export function ageOn(dob: unknown, today: Date): number | null {
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const b = new Date(`${dob}T00:00:00Z`);
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  if (today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export function analyse(family: Family, data: CamData, today: Date = new Date()): Analysis {
  const d = DEFAULTS[family];
  const inc = data.income ?? {};
  const loanReq = data.loanRequest ?? {};
  const rem = data.remarks ?? {};
  const profileText = String(inc.profile ?? "");
  const profile: Analysis["profile"] = profileText === "Salaried" ? "SALARIED" : profileText.startsWith("Self-employed") ? "SELF_EMPLOYED" : null;

  // financial years, newest first as entered
  const fin = rows(data, "income", "financials");
  const financials: FinancialYear[] = fin.map((r, i) => {
    const turnover = num(r.turnover);
    const netProfit = num(r.netProfit);
    const cash = netProfit === null ? null : netProfit + (num(r.depreciation) ?? 0) + (num(r.interestPaid) ?? 0) + (num(r.remuneration) ?? 0);
    const older = fin[i + 1] ? num(fin[i + 1]!.turnover) : null;
    return {
      year: String(r.year ?? `Year ${i + 1}`),
      turnover,
      netProfit,
      margin: turnover && netProfit !== null ? rnd((netProfit / turnover) * 100, 1) : null,
      cashProfit: cash,
      growth: turnover !== null && older ? rnd(((turnover - older) / older) * 100, 1) : null,
    };
  });

  // monthly income considered
  let monthlyIncome: number | null = null;
  let incomeBasis = "Not enough information yet";
  if (family === "EDUCATION") {
    monthlyIncome = num(loanReq.coApplicantIncome);
    if (monthlyIncome !== null) incomeBasis = "Co-applicant's monthly income";
  } else if (profile === "SALARIED") {
    const net = num(inc.netMonthly);
    if (net !== null) {
      monthlyIncome = net + (num(inc.otherIncome) ?? 0) * 0.5;
      incomeBasis = "Net monthly salary, plus half of other income";
    }
  } else if (profile === "SELF_EMPLOYED") {
    const latest = financials.find((f) => f.cashProfit !== null);
    if (latest?.cashProfit != null) {
      monthlyIncome = latest.cashProfit / 12;
      incomeBasis = `Cash profit of ${latest.year} spread over 12 months (net profit + depreciation + interest + remuneration)`;
    }
  }

  // obligations
  const loans = rows(data, "obligations", "loans");
  const loanEmi = sum(loans.filter((l) => l.foir !== "No").map((l) => num(l.emi)));
  const cardObligation = Math.round((num(data.obligations?.cardOutstanding) ?? 0) * 0.05);
  const existingEmi = loanEmi + cardObligation;
  const liabilities = sum(loans.map((l) => num(l.outstanding))) + (num(data.obligations?.cardOutstanding) ?? 0);

  // the loan being asked for
  const requested = num(loanReq.amount);
  const tenureYears = num(loanReq.tenureYears) ?? num(rem.recommendedTenure);
  const tenureMonths = tenureYears && tenureYears > 0 ? Math.round(tenureYears * 12) : d.tenureMonths;
  const staffRate = num(rem.assumedRate);
  const staffCeiling = num(rem.foirCeiling);
  const rate = staffRate ?? d.rate;
  const foirCeiling = staffCeiling ?? d.foirCeiling;
  const proposedEmi = requested ? emi(requested, rate, tenureMonths) : null;
  const room = monthlyIncome ? roomForEmi(monthlyIncome, foirCeiling, existingEmi) : 0;
  const eligible = monthlyIncome ? loanForEmi(room, rate, tenureMonths) : null;
  const foirAfter = monthlyIncome ? foir(existingEmi, proposedEmi, monthlyIncome) : null;

  // banking
  const months = rows(data, "banking", "months");
  const credits = months.map((m) => num(m.credits));
  const debits = months.map((m) => num(m.debits));
  const returns = sum(months.map((m) => num(m.returns))) + 0;
  const bouncesDeclared = num(data.banking?.emiBounces) ?? 0;
  const avgBalance = avg(months.map((m) => num(m.avgBalance)));
  const banking = {
    months: months.length,
    avgCredits6: rnd(avg(credits.slice(0, 6))),
    avgCredits12: rnd(avg(credits.slice(0, 12))),
    avgDebits12: rnd(avg(debits.slice(0, 12))),
    avgBalance: rnd(avgBalance),
    returns: Math.max(returns, bouncesDeclared),
    abbToEmi: avgBalance !== null && proposedEmi ? rnd(avgBalance / proposedEmi, 2) : null,
  };

  // GST
  const g = rows(data, "gst", "months");
  const sales = g.map((m) => num(m.sales));
  const gstTotal = sum(sales);
  const recent = avg(sales.slice(0, 6));
  const prior = avg(sales.slice(6, 12));
  const latestTurnover = financials.find((f) => f.turnover !== null)?.turnover ?? null;
  const annualised = g.length >= 6 ? (gstTotal / g.length) * 12 : null;
  const gst = {
    months: g.length,
    total: gstTotal,
    avg: rnd(avg(sales)),
    trendPct: recent !== null && prior ? rnd(((recent - prior) / prior) * 100, 1) : null,
    annualised: rnd(annualised),
    varianceVsDeclared: annualised !== null && latestTurnover ? rnd(((annualised - latestTurnover) / latestTurnover) * 100, 1) : null,
    creditsToSales: banking.avgCredits12 !== null && avg(sales) ? rnd(banking.avgCredits12 / (avg(sales) as number), 2) : null,
  };

  // property
  const pr = data.property ?? {};
  const agreement = num(pr.agreementValue);
  const market = num(pr.marketValue);
  const value = agreement !== null && market !== null ? Math.min(agreement, market) : (agreement ?? market);
  const property = {
    value,
    basis: agreement !== null && market !== null ? "Lower of agreement value and your estimate of market value" : agreement !== null ? "Agreement value" : market !== null ? "Estimated market value" : "Not given",
    ltv: requested && value ? rnd(ltv(requested, value), 1) : null,
  };

  // net worth
  const assets = sum(rows(data, "assets", "assets").map((a) => num(a.value)));
  const netWorth = { assets, liabilities, net: assets - liabilities };

  // debt service cover for a business
  let cover: number | null = null;
  const lat = financials.find((f) => f.netProfit !== null);
  const latRow = lat ? fin[financials.indexOf(lat)]! : null;
  if (profile === "SELF_EMPLOYED" && latRow) {
    cover = rnd(dscr(num(latRow.netProfit) ?? 0, num(latRow.depreciation) ?? 0, num(latRow.interestPaid) ?? 0, (existingEmi + (proposedEmi ?? 0)) * 12), 2);
  }

  const cibil = num(data.obligations?.cibilScore);
  const age = ageOn(data.applicant?.dob, today);

  // flags
  const flags: Flag[] = [];
  const add = (level: Flag["level"], text: string) => flags.push({ level, text });
  if (cibil !== null) {
    if (cibil < 650) add("risk", `CIBIL score ${cibil} is below 650`);
    else if (cibil < 700) add("watch", `CIBIL score ${cibil} is below 700, some lenders will not go ahead`);
    else if (cibil >= 750) add("good", `CIBIL score ${cibil} is strong`);
  }
  if (data.obligations?.overdue === "Yes") add("risk", "A payment was missed or overdue in the last 12 months");
  if (data.obligations?.settled === "Yes") add("risk", "A loan was settled, written off or restructured");
  if (foirAfter !== null) {
    if (foirAfter > foirCeiling) add("risk", `Repayment after this loan would be ${rnd(foirAfter, 1)}% of income, above the ${foirCeiling}% ceiling`);
    else if (foirAfter > foirCeiling - 10) add("watch", `Repayment after this loan would be ${rnd(foirAfter, 1)}% of income, close to the ${foirCeiling}% ceiling`);
    else add("good", `Repayment after this loan would be ${rnd(foirAfter, 1)}% of income, comfortably inside the ${foirCeiling}% ceiling`);
  }
  if (requested && eligible !== null && requested > eligible) add("risk", `The loan asked for is more than the income supports (about ₹${Math.round(eligible).toLocaleString("en-IN")} at the assumed rate and ceiling)`);
  if (banking.returns >= 3) add("risk", `${banking.returns} cheque or EMI returns in the last 12 months`);
  else if (banking.returns >= 1) add("watch", `${banking.returns} cheque or EMI return in the last 12 months`);
  if (banking.abbToEmi !== null && banking.abbToEmi < 1) add("watch", "Average bank balance is lower than the new EMI");
  if (gst.varianceVsDeclared !== null) {
    if (Math.abs(gst.varianceVsDeclared) > 25) add("risk", `GST sales annualise ${gst.varianceVsDeclared > 0 ? "above" : "below"} the declared turnover by ${Math.abs(gst.varianceVsDeclared)}%`);
    else if (Math.abs(gst.varianceVsDeclared) > 15) add("watch", `GST sales differ from the declared turnover by ${Math.abs(gst.varianceVsDeclared)}%`);
  }
  if (gst.trendPct !== null && gst.trendPct < -15) add("watch", `GST sales fell ${Math.abs(gst.trendPct)}% over the latest six months`);
  const vintage = num(inc.vintageYears);
  if (profile === "SELF_EMPLOYED" && vintage !== null) {
    if (vintage < 2) add("risk", `Only ${vintage} year(s) in this business`);
    else if (vintage < 3) add("watch", `${vintage} years in this business, many lenders ask for 3`);
  }
  if (profile === "SALARIED" && (inc.salaryMode === "Cash" || inc.salaryMode === "Part bank, part cash")) add("watch", "Salary is not fully paid through the bank");
  if (cover !== null) {
    if (cover < 1) add("risk", `Debt service cover is ${cover}, below 1`);
    else if (cover < 1.25) add("watch", `Debt service cover is ${cover}, thin`);
  }
  if (property.ltv !== null) {
    const cap = family === "HOME" ? 85 : 70;
    if (property.ltv > cap + 10) add("risk", `Loan would be ${property.ltv}% of the property value`);
    else if (property.ltv > cap) add("watch", `Loan would be ${property.ltv}% of the property value, above the usual ${cap}%`);
  }
  if (pr.titleClear === "No") add("risk", "The property title is not clear");
  if (pr.existingCharge === "Yes") add("watch", "The property is already mortgaged");
  if (age !== null) {
    if (age < 21) add("risk", `Applicant is ${age} years old`);
    else if (age + tenureMonths / 12 > 70) add("watch", `Applicant would be about ${Math.round(age + tenureMonths / 12)} at the end of the loan`);
  }
  if (data.loanRequest?.previousRejection === "Yes") add("watch", "A loan application was rejected in the last 12 months");

  return {
    profile,
    incomeBasis,
    monthlyIncome: rnd(monthlyIncome),
    existingEmi,
    cardObligation,
    rate,
    rateIsAssumed: staffRate === null,
    tenureMonths,
    foirCeiling,
    ceilingIsAssumed: staffCeiling === null,
    requested,
    proposedEmi: rnd(proposedEmi),
    foirAfter: rnd(foirAfter, 1),
    room: Math.round(room),
    eligible: rnd(eligible),
    financials,
    dscr: cover,
    banking,
    gst,
    property,
    netWorth,
    cibil,
    age,
    flags,
  };
}
