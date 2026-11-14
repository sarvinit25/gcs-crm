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

/** Rules taken from the lender-style CAM sheets we were given; each is shown in the workbook so it can be changed. */
export const RULES = {
  /** Profit that jumps by more than this against the year before is averaged with it instead of taken as it stands. */
  jumpLimit: 1.35,
  marginCapTrading: 0.15,
  marginCapService: 0.3,
  /** Rent counted only up to the main income; half of farm income. */
  agriShare: 0.5,
  /** "Double whammy": the repayment ratio and the loan-to-value together should not pass this. */
  doubleWhammy: 130,
  /** Turnover method for a working-capital limit: 30% of turnover, of which the bank funds four-fifths. */
  wcTurnoverShare: 0.3,
  wcBankShare: 0.8,
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

export type Program = { key: string; label: string; annual: number | null; note: string };

export type ScoreItem = { name: string; value: string; points: number; min: number; max: number };
export type Scorecard = { items: ScoreItem[]; percent: number | null; grade: string | null; note: string };

export type Analysis = {
  profile: "SALARIED" | "SELF_EMPLOYED" | null;
  incomeBasis: string;
  monthlyIncome: number | null;
  /** Monthly EMIs of running loans the applicant says count, plus 5% of card dues, plus co-applicants' EMIs. */
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
    creditsTrendPct: number | null;
  };
  /** The statement worked out in detail: balances on four dates a month, EMIs seen, return rates. */
  bankingDetail: { months: number; abb: number | null; emisSeenAvg: number | null; declaredEmi: number; inwardPct: number | null; outwardPct: number | null };
  gst: { months: number; total: number; avg: number | null; trendPct: number | null; annualised: number | null; varianceVsDeclared: number | null; creditsToSales: number | null };
  property: { value: number | null; basis: string; ltv: number | null; ltvOnCost: number | null; ltvOnMarket: number | null; marketValue: number | null; cost: number | null };
  netWorth: { assets: number; liabilities: number; net: number };
  coApplicants: { count: number; income: number; emi: number; lowestCibil: number | null; oldestAgeAtMaturity: number | null };
  /** Every way the business income can be taken, side by side. */
  programs: Program[];
  program: { chosen: string; highest: string | null };
  /** What the average balance alone would support: maximum EMI = (130% less the loan-to-value) × average balance. */
  bankingProgram: { abb: number; ltvPct: number; maxFoirPct: number; maxEmi: number; eligible: number | null } | null;
  doubleWhammy: { total: number; limit: number } | null;
  ratios: {
    grossMarginPct: number | null;
    pbditPct: number | null;
    roePct: number | null;
    debtEquityAfter: number | null;
    currentRatio: number | null;
    debtorDays: number | null;
    inventoryDays: number | null;
    creditorDays: number | null;
    workingCapitalGapDays: number | null;
    highCostDebtPct: number | null;
    projectedDscr: number | null;
  };
  workingCapital: { turnover: number; limit: number; bankFinance: number; existing: number; headroom: number } | null;
  tracks: { outstanding: number; bounces: number; dpd30: number };
  checks: { negatives: string[]; concerns: number };
  scorecard: Scorecard;
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
const rnd = (n: number | null, d = 0) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function ageOn(dob: unknown, today: Date): number | null {
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const b = new Date(`${dob}T00:00:00Z`);
  let age = today.getUTCFullYear() - b.getUTCFullYear();
  if (today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/** A profit that jumps more than 35% on the year before is averaged with it: the rule the lender-style sheets use. */
const considered = (latest: number | null, prior: number | null) => (latest === null ? null : prior !== null && prior > 0 && latest > RULES.jumpLimit * prior ? (latest + prior) / 2 : latest);

const gradeOf = (p: number) => (p > 0.8 ? "A" : p > 0.6 ? "B" : p > 0.5 ? "C" : p > 0.35 ? "D" : p > 0.2 ? "E" : "F");

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
  const latestIdx = financials.findIndex((f) => f.cashProfit !== null);
  const latestRaw = latestIdx >= 0 ? fin[latestIdx]! : null;
  const priorRaw = latestIdx >= 0 ? (fin[latestIdx + 1] ?? null) : null;

  // co-applicants: their income and EMIs join the case, the weakest score and the oldest age are watched
  const coRows = rows(data, "loanRequest", "coApplicants");
  const singleCo = coRows.length === 0 && loanReq.coApplicant === "Yes" ? num(loanReq.coApplicantIncome) : null;
  const coIncome = sum(coRows.map((r) => num(r.monthlyIncome))) + (singleCo ?? 0);
  const coEmi = sum(coRows.map((r) => num(r.emi)));
  const coCibil = coRows.map((r) => num(r.cibil)).filter((x): x is number => x !== null);
  const tenureYearsAsked = num(loanReq.tenureYears) ?? num(rem.recommendedTenure);
  const tenureMonths = tenureYearsAsked && tenureYearsAsked > 0 ? Math.round(tenureYearsAsked * 12) : d.tenureMonths;
  const coAges = coRows.map((r) => ageOn(r.dob, today)).filter((x): x is number => x !== null);
  const age = ageOn(data.applicant?.dob, today);
  const oldest = [age, ...coAges].filter((x): x is number => x !== null);
  const coApplicants = {
    count: coRows.length || (singleCo !== null ? 1 : 0),
    income: coIncome,
    emi: coEmi,
    lowestCibil: coCibil.length ? Math.min(...coCibil) : null,
    oldestAgeAtMaturity: oldest.length ? Math.round(Math.max(...oldest) + tenureMonths / 12) : null,
  };

  // every way the income can be taken
  const programs: Program[] = [];
  if (profile === "SALARIED") {
    const net = num(inc.netMonthly);
    if (net !== null) programs.push({ key: "salary", label: "Salaried income", annual: (net + (num(inc.otherIncome) ?? 0) * 0.5) * 12, note: "Net monthly salary plus half of other income, for 12 months" });
  } else if (profile === "SELF_EMPLOYED" && latestRaw && latestIdx >= 0) {
    const cash = financials[latestIdx]!.cashProfit;
    programs.push({ key: "cash", label: "Cash profit (default)", annual: cash, note: `Net profit + depreciation + interest + remuneration of ${financials[latestIdx]!.year}` });
    const np = considered(num(latestRaw.netProfit), num(priorRaw?.netProfit));
    const dep = considered(num(latestRaw.depreciation), num(priorRaw?.depreciation));
    programs.push({ key: "net", label: "Net profit program", annual: np === null ? null : np + (dep ?? 0) + (num(latestRaw.remuneration) ?? 0), note: `Net profit and depreciation, each averaged with the year before if it jumped more than ${Math.round((RULES.jumpLimit - 1) * 100)}%, plus remuneration` });
    const turnover = num(latestRaw.turnover);
    const gp = num(latestRaw.grossProfit);
    const industry = String(inc.industry ?? "");
    const cap = ["Manufacturing", "Trading", "Retail", "Construction / real estate"].includes(industry) ? RULES.marginCapTrading : RULES.marginCapService;
    if (turnover && gp !== null) {
      const margin = Math.min(cap, gp / turnover);
      programs.push({ key: "gross", label: "Gross margin program", annual: turnover * margin, note: `Turnover × the lower of the actual gross margin (${rnd((gp / turnover) * 100, 1)}%) and the cap (${Math.round(cap * 100)}% for ${cap === RULES.marginCapTrading ? "trading, manufacturing and similar" : "services and professions"})` });
    }
  }
  const valid = programs.filter((p) => p.annual !== null);
  const best = valid.length ? valid.reduce((m, p) => ((p.annual as number) > (m.annual as number) ? p : m)) : null;
  const wanted = String(rem.incomeProgram ?? "");
  const pick = wanted === "Net profit program" ? valid.find((p) => p.key === "net") : wanted === "Gross margin program" ? valid.find((p) => p.key === "gross") : wanted === "Highest of the programs" ? best : valid.find((p) => p.key === "cash" || p.key === "salary");
  const chosen = pick ?? valid[0] ?? null;

  // monthly income considered
  let monthlyIncome: number | null = null;
  let incomeBasis = "Not enough information yet";
  if (family === "EDUCATION") {
    monthlyIncome = coRows.length || singleCo !== null ? coIncome : null;
    if (monthlyIncome !== null) incomeBasis = coRows.length ? "Co-applicants' monthly income" : "Co-applicant's monthly income";
  } else {
    let main: number | null = null;
    if (chosen && chosen.annual !== null) {
      main = chosen.annual / 12;
      incomeBasis = profile === "SALARIED" ? "Net monthly salary, plus half of other income" : `${chosen.label}: ${chosen.note}, spread over 12 months`;
    }
    const rent = Math.min(num(inc.rentalIncome) ?? 0, main ?? 0);
    const agri = ((num(inc.agriIncome) ?? 0) * RULES.agriShare) / 12;
    const extras: string[] = [];
    if (rent > 0) extras.push("rent up to the main income");
    if (agri > 0) extras.push("half of the farm income");
    if (coIncome > 0) extras.push("the co-applicants' income");
    if (main !== null || rent + agri + coIncome > 0) {
      monthlyIncome = (main ?? 0) + rent + agri + coIncome;
      if (extras.length) incomeBasis = main !== null ? `${incomeBasis}, plus ${extras.join(", ")}` : `Only ${extras.join(", ")}`;
    }
  }

  // obligations
  const loans = rows(data, "obligations", "loans");
  const isCounted = (l: Record<string, unknown>) => l.foir !== "No" && l.status !== "Closed" && l.status !== "Will be closed from this loan";
  const isLive = (l: Record<string, unknown>) => l.status !== "Closed";
  const loanEmi = sum(loans.filter(isCounted).map((l) => num(l.emi)));
  const cardObligation = Math.round((num(data.obligations?.cardOutstanding) ?? 0) * 0.05);
  const existingEmi = loanEmi + cardObligation + coEmi;
  const liabilities = sum(loans.filter(isLive).map((l) => num(l.outstanding))) + (num(data.obligations?.cardOutstanding) ?? 0);
  const tracks = { outstanding: sum(loans.filter(isLive).map((l) => num(l.outstanding))), bounces: sum(loans.map((l) => num(l.bounces))), dpd30: sum(loans.map((l) => num(l.dpd30))) };

  // the loan being asked for
  const requested = num(loanReq.amount);
  const tenureYears = tenureYearsAsked;
  const staffRate = num(rem.assumedRate);
  const staffCeiling = num(rem.foirCeiling);
  const rate = staffRate ?? d.rate;
  const foirCeiling = staffCeiling ?? d.foirCeiling;
  const proposedEmi = requested ? emi(requested, rate, tenureMonths) : null;
  const room = monthlyIncome ? roomForEmi(monthlyIncome, foirCeiling, existingEmi) : 0;
  const eligible = monthlyIncome ? loanForEmi(room, rate, tenureMonths) : null;
  const foirAfter = monthlyIncome ? foir(existingEmi, proposedEmi, monthlyIncome) : null;

  // banking, as the customer gave it month by month
  const months = rows(data, "banking", "months");
  const credits = months.map((m) => num(m.credits));
  const debits = months.map((m) => num(m.debits));
  const returnsGiven = sum(months.map((m) => num(m.returns)));
  const bouncesDeclared = num(data.banking?.emiBounces) ?? 0;

  // banking, as staff worked it out from the statements
  const det = rows(data, "bankingDetail", "detail");
  const monthAbb = det.map((m) => avg([num(m.bal5), num(m.bal10), num(m.bal15), num(m.bal25)]));
  const abb = data.bankingDetail?.includeInAbb === "No" ? null : avg(monthAbb);
  const emisSeen = det.map((m) => num(m.emisSeen));
  const liveEmi = sum(loans.filter(isLive).map((l) => num(l.emi)));
  const debitCount = sum(det.map((m) => num(m.debitCount)));
  const creditCount = sum(det.map((m) => num(m.creditCount)));
  const inward = sum(det.map((m) => num(m.inward)));
  const outward = sum(det.map((m) => num(m.outward)));
  const bankingDetail = {
    months: det.length,
    abb: rnd(abb),
    emisSeenAvg: emisSeen.some((x) => x !== null) ? rnd(avg(emisSeen)) : null,
    declaredEmi: liveEmi,
    inwardPct: debitCount > 0 ? rnd((inward / debitCount) * 100, 1) : null,
    outwardPct: creditCount > 0 ? rnd((outward / creditCount) * 100, 1) : null,
  };
  const avgBalance = avg(months.map((m) => num(m.avgBalance))) ?? abb;
  const c6 = avg(credits.slice(0, 6));
  const cPrior = credits.length >= 7 ? avg(credits.slice(6, 12)) : null;
  const banking = {
    months: months.length,
    avgCredits6: rnd(c6),
    avgCredits12: rnd(avg(credits.slice(0, 12))),
    avgDebits12: rnd(avg(debits.slice(0, 12))),
    avgBalance: rnd(avgBalance),
    returns: Math.max(returnsGiven, bouncesDeclared, inward + outward),
    abbToEmi: avgBalance !== null && proposedEmi ? rnd(avgBalance / proposedEmi, 2) : null,
    creditsTrendPct: c6 !== null && cPrior ? rnd(((c6 - cPrior) / cPrior) * 100, 1) : null,
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

  // property: the lender's valuers win over the customer's own estimate
  const pr = data.property ?? {};
  const val = data.valuation ?? {};
  const agreement = num(pr.agreementValue);
  const market = num(pr.marketValue);
  const v1 = num(val.valuer1Value);
  const v2 = num(val.valuer2Value);
  const valuer = v1 !== null && v2 !== null ? Math.min(v1, v2) : (v1 ?? v2);
  const value = valuer !== null ? (agreement !== null ? Math.min(agreement, valuer) : valuer) : agreement !== null && market !== null ? Math.min(agreement, market) : (agreement ?? market);
  const marketValue = valuer ?? market;
  const property = {
    value,
    basis: valuer !== null ? (v1 !== null && v2 !== null ? "Lower of the two valuers' values" : "The valuer's value") + (agreement !== null ? ", against the agreement value" : "") : agreement !== null && market !== null ? "Lower of agreement value and your estimate of market value" : agreement !== null ? "Agreement value" : market !== null ? "Estimated market value" : "Not given",
    ltv: requested && value ? rnd(ltv(requested, value), 1) : null,
    ltvOnCost: requested && agreement ? rnd(ltv(requested, agreement), 1) : null,
    ltvOnMarket: requested && marketValue ? rnd(ltv(requested, marketValue), 1) : null,
    marketValue: marketValue ?? null,
    cost: agreement,
  };

  // net worth
  const assets = sum(rows(data, "assets", "assets").map((a) => num(a.value)));
  const netWorth = { assets, liabilities, net: assets - liabilities };

  // debt service cover for a business
  let cover: number | null = null;
  if (profile === "SELF_EMPLOYED" && latestRaw) {
    cover = rnd(dscr(num(latestRaw.netProfit) ?? 0, num(latestRaw.depreciation) ?? 0, num(latestRaw.interestPaid) ?? 0, (existingEmi + (proposedEmi ?? 0)) * 12), 2);
  }

  // balance-sheet ratios
  const bsRows = rows(data, "income", "balanceSheet");
  const bs = bsRows[0] ?? null;
  const turn = latestRaw ? num(latestRaw.turnover) : null;
  const gp = latestRaw ? num(latestRaw.grossProfit) : null;
  const cogs = turn !== null && gp !== null ? turn - gp : null;
  const netProfitLatest = latestRaw ? num(latestRaw.netProfit) : null;
  const bank = num(bs?.bankDebt) ?? 0;
  const hc = num(bs?.highCostDebt) ?? 0;
  const nw = num(bs?.netWorth);
  const ca = num(bs?.currentAssets);
  const cl = num(bs?.currentLiabilities);
  const days = (x: number | null, base: number | null) => (x !== null && base ? rnd((x / base) * 365, 0) : null);
  const debtorDays = days(num(bs?.debtors), turn);
  const inventoryDays = days(num(bs?.inventory), cogs);
  const creditorDays = days(num(bs?.creditors), cogs);
  const projSales = num(inc.projectedSales);
  const projMargin = num(inc.projectedMarginPct);
  const commitments = (existingEmi + (proposedEmi ?? 0)) * 12;
  const ratios = {
    grossMarginPct: turn && gp !== null ? rnd((gp / turn) * 100, 1) : null,
    pbditPct: turn && latestRaw && netProfitLatest !== null ? rnd(((netProfitLatest + (num(latestRaw.tax) ?? 0) + (num(latestRaw.interestPaid) ?? 0) + (num(latestRaw.depreciation) ?? 0)) / turn) * 100, 1) : null,
    roePct: nw && netProfitLatest !== null ? rnd((netProfitLatest / nw) * 100, 1) : null,
    debtEquityAfter: nw && nw > 0 && bs ? rnd((bank + hc + (requested ?? 0)) / nw, 2) : null,
    currentRatio: ca !== null && cl ? rnd(ca / cl, 2) : null,
    debtorDays,
    inventoryDays,
    creditorDays,
    workingCapitalGapDays: debtorDays !== null && inventoryDays !== null && creditorDays !== null ? debtorDays + inventoryDays - creditorDays : null,
    highCostDebtPct: bank + hc > 0 && bs ? rnd((hc / (bank + hc)) * 100, 1) : null,
    projectedDscr: projSales && projMargin !== null && commitments > 0 ? rnd((projSales * projMargin) / 100 / commitments, 2) : null,
  };

  // working-capital limit by the turnover method
  let workingCapital: Analysis["workingCapital"] = null;
  if (profile === "SELF_EMPLOYED" && turn) {
    const limit = turn * RULES.wcTurnoverShare;
    const bankFinance = limit * RULES.wcBankShare;
    const existing = num(inc.existingWcLimit) ?? 0;
    workingCapital = { turnover: turn, limit: Math.round(limit), bankFinance: Math.round(bankFinance), existing, headroom: Math.max(0, Math.round(bankFinance - existing)) };
  }

  // banking program: the average balance alone, and the loan-to-value, set the most the EMI can be
  let bankingProgram: Analysis["bankingProgram"] = null;
  const ltvNow = property.ltv;
  if (abb !== null && abb > 0 && ltvNow !== null && (family === "LAP" || family === "HOME")) {
    const maxFoirPct = Math.max(0, RULES.doubleWhammy - ltvNow);
    const maxEmi = (maxFoirPct / 100) * abb;
    bankingProgram = { abb: Math.round(abb), ltvPct: ltvNow, maxFoirPct: rnd(maxFoirPct, 1) as number, maxEmi: Math.round(maxEmi), eligible: rnd(loanForEmi(Math.max(0, maxEmi - existingEmi), rate, tenureMonths)) };
  }
  const doubleWhammy = family === "LAP" && foirAfter !== null && ltvNow !== null ? { total: rnd(foirAfter + ltvNow, 1) as number, limit: RULES.doubleWhammy } : null;

  const cibil = num(data.obligations?.cibilScore);

  // checks done by staff
  const chk = data.checks ?? {};
  const badValues = ["Negative", "Fraud suspected", "Negative area", "Found earlier case"];
  const labels: Record<string, string> = { fiResidence: "Field visit at the residence", fiOffice: "Field visit at the office", tvr: "Telephone verification", rcu: "Document / income check", cibilCheck: "Credit bureau check", dedupe: "Duplicate check", negativeArea: "Negative area check" };
  const negatives = Object.keys(labels).filter((k) => badValues.includes(String(chk[k] ?? ""))).map((k) => `${labels[k]}: ${chk[k]}`);
  const concerns = Object.values(chk).filter((v) => v === "Concern").length;

  // flags
  const flags: Flag[] = [];
  const add = (level: Flag["level"], text: string) => flags.push({ level, text });
  if (cibil !== null) {
    if (cibil < 650) add("risk", `CIBIL score ${cibil} is below 650`);
    else if (cibil < 700) add("watch", `CIBIL score ${cibil} is below 700, some lenders will not go ahead`);
    else if (cibil >= 750) add("good", `CIBIL score ${cibil} is strong`);
  }
  if (coApplicants.lowestCibil !== null && coApplicants.lowestCibil < 650) add("watch", `A co-applicant's CIBIL score is ${coApplicants.lowestCibil}, below 650`);
  if (data.obligations?.overdue === "Yes") add("risk", "A payment was missed or overdue in the last 12 months");
  if (data.obligations?.settled === "Yes") add("risk", "A loan was settled, written off or restructured");
  if (tracks.dpd30 > 0) add("watch", `Running loans were 30 days or more late ${tracks.dpd30} time${tracks.dpd30 === 1 ? "" : "s"} in the track`);
  if (tracks.bounces > 0) add("watch", `${tracks.bounces} bounce${tracks.bounces === 1 ? "" : "s"} in the running loans' track`);
  if (foirAfter !== null) {
    if (foirAfter > foirCeiling) add("risk", `Repayment after this loan would be ${rnd(foirAfter, 1)}% of income, above the ${foirCeiling}% ceiling`);
    else if (foirAfter > foirCeiling - 10) add("watch", `Repayment after this loan would be ${rnd(foirAfter, 1)}% of income, close to the ${foirCeiling}% ceiling`);
    else add("good", `Repayment after this loan would be ${rnd(foirAfter, 1)}% of income, comfortably inside the ${foirCeiling}% ceiling`);
  }
  if (doubleWhammy && doubleWhammy.total > doubleWhammy.limit) add("watch", `Repayment ratio and loan-to-value together are ${doubleWhammy.total}%: some lenders cap the two together at ${doubleWhammy.limit}%`);
  if (requested && eligible !== null && requested > eligible) add("risk", `The loan asked for is more than the income supports (about ${inr(eligible)} at the assumed rate and ceiling)`);
  if (banking.returns >= 3) add("risk", `${banking.returns} cheque or EMI returns in the last 12 months`);
  else if (banking.returns >= 1) add("watch", `${banking.returns} cheque or EMI return in the last 12 months`);
  if (banking.abbToEmi !== null && banking.abbToEmi < 1) add("watch", "Average bank balance is lower than the new EMI");
  if (bankingDetail.emisSeenAvg !== null && liveEmi > 0 ? bankingDetail.emisSeenAvg > liveEmi * 1.2 && bankingDetail.emisSeenAvg - liveEmi > 2000 : bankingDetail.emisSeenAvg !== null && bankingDetail.emisSeenAvg > 2000) {
    add("risk", `The statement shows about ${inr(bankingDetail.emisSeenAvg as number)} a month going out as EMIs, but the loans listed come to ${inr(liveEmi)}: a loan may be missing`);
  }
  if (banking.creditsTrendPct !== null && banking.creditsTrendPct < -20) add("watch", `Bank credits fell ${Math.abs(banking.creditsTrendPct)}% over the latest six months`);
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
  if (ratios.projectedDscr !== null && ratios.projectedDscr < 1) add("watch", `Debt cover on the expected turnover is ${ratios.projectedDscr}, below 1`);
  if (ratios.currentRatio !== null && ratios.currentRatio < 1) add("watch", `Current ratio is ${ratios.currentRatio}, below 1`);
  if (ratios.debtEquityAfter !== null && ratios.debtEquityAfter > 3) add("watch", `Debt to net worth would be ${ratios.debtEquityAfter} after this loan`);
  if (ratios.highCostDebtPct !== null && ratios.highCostDebtPct > 20) add("watch", `${ratios.highCostDebtPct}% of the business's borrowing is unsecured`);
  if (property.ltv !== null) {
    const cap = family === "HOME" ? 85 : 70;
    if (property.ltv > cap + 10) add("risk", `Loan would be ${property.ltv}% of the property value`);
    else if (property.ltv > cap) add("watch", `Loan would be ${property.ltv}% of the property value, above the usual ${cap}%`);
  }
  if (valuer !== null && market !== null && market > 0 && valuer < market * 0.85) add("watch", `The valuer's value is ${Math.round((1 - valuer / market) * 100)}% below the customer's own estimate`);
  if (pr.titleClear === "No") add("risk", "The property title is not clear");
  if (pr.existingCharge === "Yes") add("watch", "The property is already mortgaged");
  if (val.approvedPlan === "No") add("watch", "There is no approved plan for the property");
  if (val.marketability === "Poor") add("watch", "The valuer rates the property's marketability as poor");
  if (age !== null) {
    if (age < 21) add("risk", `Applicant is ${age} years old`);
    else if (age + tenureMonths / 12 > 70) add("watch", `Applicant would be about ${Math.round(age + tenureMonths / 12)} at the end of the loan`);
  }
  if (coApplicants.oldestAgeAtMaturity !== null && coApplicants.oldestAgeAtMaturity > 70 && !(age !== null && age + tenureMonths / 12 > 70)) add("watch", `A co-applicant would be about ${coApplicants.oldestAgeAtMaturity} at the end of the loan`);
  if (data.loanRequest?.previousRejection === "Yes") add("watch", "A loan application was rejected in the last 12 months");
  for (const n of negatives) add("risk", n);
  if (concerns > 0) add("watch", `${concerns} point${concerns === 1 ? "" : "s"} marked as a concern in the credit checks`);
  const highDeviations = rows(data, "remarks", "deviationList").filter((r) => r.level === "High").length;
  if (highDeviations > 0) add("watch", `${highDeviations} high-level deviation${highDeviations === 1 ? "" : "s"} from the lender's policy`);

  // scorecard: our own indicative score, built on the tests lenders commonly use
  const items: ScoreItem[] = [];
  const pt = (name: string, value: string, points: number, min: number, max: number) => items.push({ name, value, points, min, max });
  if (cibil !== null) pt("CIBIL score", String(cibil), cibil >= 750 ? 10 : cibil >= 700 ? 5 : cibil >= 650 ? 0 : -10, -10, 10);
  if (foirAfter !== null) pt("Repayment after the loan against the ceiling", `${rnd(foirAfter, 1)}% (ceiling ${foirCeiling}%)`, foirAfter <= foirCeiling - 15 ? 10 : foirAfter <= foirCeiling - 5 ? 5 : foirAfter <= foirCeiling ? 0 : -10, -10, 10);
  if (data.obligations?.overdue || data.obligations?.settled) pt("Payment history", data.obligations?.overdue === "Yes" || data.obligations?.settled === "Yes" ? "Missed or settled" : "Clean", data.obligations?.overdue === "Yes" || data.obligations?.settled === "Yes" ? -10 : 5, -10, 5);
  if (banking.months > 0 || det.length > 0 || data.banking?.emiBounces != null) pt("Cheque and EMI returns", String(banking.returns), banking.returns === 0 ? 5 : banking.returns < 3 ? -5 : -10, -10, 5);
  if (banking.abbToEmi !== null) pt("Average balance against the new EMI", `${banking.abbToEmi} times`, banking.abbToEmi >= 3 ? 5 : banking.abbToEmi >= 1 ? 0 : -5, -5, 5);
  if (profile === "SELF_EMPLOYED" && vintage !== null) pt("Years in the business", String(vintage), vintage >= 5 ? 5 : vintage >= 3 ? 0 : -5, -5, 5);
  const jobYears = num(inc.yearsInJob);
  if (profile === "SALARIED" && jobYears !== null) pt("Years in the current job", String(jobYears), jobYears >= 3 ? 5 : jobYears >= 1 ? 0 : -5, -5, 5);
  if (cover !== null) pt("Debt service cover", String(cover), cover <= 0.8 ? -10 : cover <= 1 ? -5 : cover <= 1.5 ? 5 : 10, -10, 10);
  if (ratios.debtEquityAfter !== null) pt("Debt to net worth after the loan", String(ratios.debtEquityAfter), ratios.debtEquityAfter <= 1 ? 10 : ratios.debtEquityAfter <= 1.5 ? 0 : -10, -10, 10);
  if (ratios.currentRatio !== null) pt("Current ratio", String(ratios.currentRatio), ratios.currentRatio <= 1 ? -10 : ratios.currentRatio <= 1.33 ? 0 : 5, -10, 5);
  if (ratios.highCostDebtPct !== null) pt("Unsecured share of business borrowing", `${ratios.highCostDebtPct}%`, ratios.highCostDebtPct <= 10 ? 5 : ratios.highCostDebtPct <= 20 ? 0 : -10, -10, 5);
  if (banking.creditsTrendPct !== null) pt("Growth in bank credits", `${banking.creditsTrendPct}%`, banking.creditsTrendPct <= 0 ? -10 : banking.creditsTrendPct <= 5 ? 0 : banking.creditsTrendPct <= 15 ? 5 : 10, -10, 10);
  if (property.ltv !== null) { const cap = family === "HOME" ? 85 : 70; pt("Loan against the property value", `${property.ltv}%`, property.ltv <= cap - 15 ? 10 : property.ltv <= cap ? 5 : property.ltv <= cap + 10 ? -5 : -10, -10, 10); }
  const ticks = ["fiResidence", "fiOffice", "tvr", "cibilCheck"].map((k) => String(chk[k] ?? "")).concat(String(chk.rcu ?? ""));
  if (ticks.some((t) => ["Positive", "Clear"].includes(t) || badValues.includes(t))) pt("Verification results", negatives.length ? "A negative result" : "Positive so far", negatives.length ? -10 : 5, -10, 5);
  if (assets > 0 || liabilities > 0) pt("Net worth", inr(netWorth.net), netWorth.net > 0 ? 5 : -5, -5, 5);
  let percent: number | null = null;
  if (items.length >= 3) {
    const lo = sum(items.map((i) => i.min));
    const hi = sum(items.map((i) => i.max));
    percent = hi > lo ? (sum(items.map((i) => i.points)) - lo) / (hi - lo) : null;
  }
  const scorecard: Scorecard = {
    items,
    percent: percent === null ? null : rnd(percent * 100, 0),
    grade: percent === null ? null : gradeOf(percent),
    note: "Our own indicative score, built on the tests lenders commonly use. It is not any lender's score and it decides nothing. A: over 80%, B: 60 to 80%, C: 50 to 60%, D: 35 to 50%, E: 20 to 35%, F: under 20%. It needs at least three of the tests to have an answer.",
  };

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
    bankingDetail,
    gst,
    property,
    netWorth,
    coApplicants,
    programs,
    program: { chosen: chosen?.label ?? "", highest: best?.label ?? null },
    bankingProgram,
    doubleWhammy,
    ratios,
    workingCapital,
    tracks,
    checks: { negatives, concerns },
    scorecard,
    cibil,
    age,
    flags,
  };
}
