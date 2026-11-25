// Sheets lenders' own CAMs carry that ours did not: financial ratios, the income methods side by side, the repayment track of
// every running loan, the working-capital limit (MPBF), fund flow and the repayment schedule of the proposed loan. Everything
// below a yellow cell is a live Excel formula, so changing a figure or an assumption recalculates the whole sheet. Which sheets
// appear depends on the product and on whether the customer is self-employed.
//
// The yellow assumptions start from figures found in real lender CAMs and published bank benchmarks (listed on the
// "Sources" sheet). Lenders still set their own, so every one can be changed in the file.

import type ExcelJS from "exceljs";
import { ageOn, type Analysis } from "./cam-analysis";
import type { CamData, Family } from "./cam-schema";

export type Kit = {
  sheet: (wb: ExcelJS.Workbook, name: string, title: string, subtitle: string, widths: number[]) => ExcelJS.Worksheet;
  heading: (ws: ExcelJS.Worksheet, row: number, text: string, cols?: number) => number;
  tableHeader: (ws: ExcelJS.Worksheet, row: number, headers: string[]) => void;
};

type Fmt = "money" | "percent" | "number" | "ratio" | "text";
const FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4C2" } };
const LINE = { style: "thin" as const, color: { argb: "FFD7DCE5" } };
const MONEY = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"##,##0';
const FORMAT: Record<Fmt, string | undefined> = { money: MONEY, percent: '0.0"%"', number: "#,##0", ratio: '0.00"x"', text: undefined };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(String(v ?? "").replace(/[,₹\s]/g, "")) || 0);
const rows = (data: CamData, section: string, table: string): Record<string, unknown>[] => ((data[section]?.[table] as Record<string, unknown>[] | undefined) ?? []).filter(Boolean);

function cell(ws: ExcelJS.Worksheet, ref: string, value: ExcelJS.CellValue, fmt: Fmt = "text", opts: { input?: boolean; bold?: boolean } = {}) {
  const c = ws.getCell(ref);
  c.value = value;
  const f = FORMAT[fmt];
  if (f) c.numFmt = f;
  c.border = { top: LINE, bottom: LINE, left: LINE, right: LINE };
  if (opts.input) c.fill = FILL;
  if (opts.bold) c.font = { bold: true };
  return c;
}
const fx = (formula: string) => ({ formula }) as ExcelJS.CellValue;
const COLS = ["B", "C", "D"] as const;

const FIN_ROWS: [string, "fin" | "bs", string][] = [
  ["Turnover / gross receipts", "fin", "turnover"],
  ["Gross profit", "fin", "grossProfit"],
  ["Net profit (after tax)", "fin", "netProfit"],
  ["Depreciation", "fin", "depreciation"],
  ["Interest paid on loans", "fin", "interestPaid"],
  ["Partner / director remuneration", "fin", "remuneration"],
  ["Tax paid", "fin", "tax"],
  ["Net worth", "bs", "netWorth"],
  ["Bank / NBFC loans (secured)", "bs", "bankDebt"],
  ["Unsecured business loans", "bs", "highCostDebt"],
  ["Loans from family / promoters", "bs", "promoterLoans"],
  ["Current assets", "bs", "currentAssets"],
  ["Current liabilities", "bs", "currentLiabilities"],
  ["Debtors", "bs", "debtors"],
  ["Stock", "bs", "inventory"],
  ["Creditors", "bs", "creditors"],
];

/** Ratios: the figures as yellow inputs (newest year first), the ratios as formulas under them. Returns the row of each input. */
function ratiosSheet(wb: ExcelJS.Workbook, kit: Kit, data: CamData, sub: string) {
  const ws = kit.sheet(wb, "Ratios", "FINANCIAL RATIOS", `${sub}. Yellow cells are the figures from the ITR and balance sheet.`, [42, 20, 20, 20]);
  const fin = rows(data, "income", "financials");
  const bs = rows(data, "income", "balanceSheet");
  kit.tableHeader(ws, 4, ["Figure", "Latest year", "Year before", "Two years before"]);
  const at: Record<string, number> = {};
  let r = 5;
  cell(ws, `A${r}`, "Financial year");
  COLS.forEach((c, i) => cell(ws, `${c}${r}`, String(fin[i]?.year ?? bs[i]?.year ?? ""), "text", { input: true }));
  r += 1;
  for (const [label, src, key] of FIN_ROWS) {
    at[key] = r;
    cell(ws, `A${r}`, label);
    COLS.forEach((c, i) => {
      const v = (src === "fin" ? fin : bs)[i]?.[key];
      cell(ws, `${c}${r}`, v === undefined || v === null || v === "" ? null : num(v), "money", { input: true });
    });
    r += 1;
  }
  r = kit.heading(ws, r + 1, "Ratios (worked out)", 4);
  const R = (k: string, c: string) => `${c}${at[k]}`;
  const pbdit = (c: string) => `(${R("netProfit", c)}+${R("tax", c)}+${R("depreciation", c)}+${R("interestPaid", c)}+${R("remuneration", c)})`;
  const ratio = (label: string, fmt: Fmt, f: (c: string, i: number) => string | null) => {
    at[label] = r;
    cell(ws, `A${r}`, label);
    COLS.forEach((c, i) => {
      const formula = f(c, i);
      cell(ws, `${c}${r}`, formula ? fx(`IFERROR(${formula},"-")`) : "-", fmt);
    });
    r += 1;
  };
  ratio("Turnover growth over the year before", "percent", (c, i) => (i < 2 ? `(${R("turnover", c)}/${R("turnover", COLS[i + 1]!)}-1)*100` : null));
  ratio("Gross profit margin", "percent", (c) => `${R("grossProfit", c)}/${R("turnover", c)}*100`);
  ratio("Net profit margin", "percent", (c) => `${R("netProfit", c)}/${R("turnover", c)}*100`);
  ratio("Cash profit (net profit + depreciation)", "money", (c) => `${R("netProfit", c)}+${R("depreciation", c)}`);
  ratio("PBDIT (with tax and remuneration added back)", "money", (c) => pbdit(c));
  ratio("PBDIT margin", "percent", (c) => `${pbdit(c)}/${R("turnover", c)}*100`);
  ratio("Interest cover (PBDIT / interest)", "ratio", (c) => `${pbdit(c)}/${R("interestPaid", c)}`);
  ratio("Current ratio", "ratio", (c) => `${R("currentAssets", c)}/${R("currentLiabilities", c)}`);
  ratio("Quick ratio (without stock)", "ratio", (c) => `(${R("currentAssets", c)}-${R("inventory", c)})/${R("currentLiabilities", c)}`);
  ratio("Debt to equity", "ratio", (c) => `(${R("bankDebt", c)}+${R("highCostDebt", c)})/${R("netWorth", c)}`);
  ratio("Total outside liabilities / net worth", "ratio", (c) => `(${R("bankDebt", c)}+${R("highCostDebt", c)}+${R("promoterLoans", c)}+${R("currentLiabilities", c)})/${R("netWorth", c)}`);
  ratio("Debtor days", "number", (c) => `${R("debtors", c)}/${R("turnover", c)}*365`);
  ratio("Stock days", "number", (c) => `${R("inventory", c)}/${R("turnover", c)}*365`);
  ratio("Creditor days", "number", (c) => `${R("creditors", c)}/${R("turnover", c)}*365`);
  ratio("Working capital gap (current assets - current liabilities)", "money", (c) => `${R("currentAssets", c)}-${R("currentLiabilities", c)}`);
  return at;
}

/** The income routes lenders use, each giving the monthly EMI it supports and the loan that EMI buys. */
function methodsSheet(wb: ExcelJS.Workbook, kit: Kit, family: Family, data: CamData, a: Analysis, sub: string, hasRatios: Record<string, number>) {
  const business = family === "BUSINESS";
  const ws = kit.sheet(wb, "Eligibility methods", "LOAN ELIGIBILITY BY EACH METHOD", `${sub}. Yellow cells are assumptions: set them to the lender's own policy.`, [46, 18, 18, 18, 18]);
  let r = kit.heading(ws, 4, "Common terms", 5);
  const common: [string, number, Fmt, string][] = [
    ["Interest rate a year", a.rate, "percent", "rate"],
    ["Tenure in months", a.tenureMonths, "number", "n"],
    ["Share of income allowed for all EMIs (FOIR)", a.foirCeiling, "percent", "foir"],
    ["EMIs already running that will continue", a.existingEmi, "money", "emi"],
    ["Amount asked for", a.requested ?? 0, "money", "ask"],
  ];
  const k: Record<string, string> = {};
  for (const [label, v, fmt, key] of common) {
    cell(ws, `A${r}`, label);
    cell(ws, `B${r}`, v, fmt, { input: true });
    k[key] = `$B$${r}`;
    r += 1;
  }

  r = kit.heading(ws, r + 1, "Inputs each method uses", 5);
  const ref = (row: number | undefined, c: string, fallback = "0") => (row ? `Ratios!${c}${row}` : fallback);
  const input = (label: string, value: ExcelJS.CellValue, fmt: Fmt, key: string, isInput = true) => {
    cell(ws, `A${r}`, label);
    cell(ws, `B${r}`, value, fmt, { input: isInput });
    k[key] = `$B$${r}`;
    r += 1;
  };
  const R = hasRatios;
  const year = (row: number | undefined, c: string) => (row ? fx(`N(${ref(row, c)})`) : 0);
  input("Net profit, latest year", year(R.netProfit, "B"), "money", "np1", !R.netProfit);
  input("Net profit, year before", year(R.netProfit, "C"), "money", "np0", !R.netProfit);
  input("Depreciation, latest year", year(R.depreciation, "B"), "money", "dep", !R.depreciation);
  // Business-loan CAMs count two thirds of depreciation below ₹15 crore turnover, all of it above.
  input("Share of depreciation counted", business ? fx(`IF(${ref(R.turnover, "B")}<150000000,66,100)`) : 100, "percent", "depShare", !business);
  input("Partner / director remuneration, latest year", year(R.remuneration, "B"), "money", "rem", !R.remuneration);
  input("Interest on loans that will be closed, a year", 0, "money", "intc");
  input("Rent from other properties, a month", num(data.income?.rentalIncome), "money", "rent");
  input("Share of rent counted", 70, "percent", "rentShare");
  input("Gross profit, latest year", year(R.grossProfit, "B"), "money", "gp1", !R.grossProfit);
  input("Gross profit, year before", year(R.grossProfit, "C"), "money", "gp0", !R.grossProfit);
  input("Interest on working capital, a year", 0, "money", "wcint");
  input("Tax paid, latest year", year(R.tax, "B"), "money", "tax", !R.tax);
  input("A year may count for at most this many times the year before", 1.5, "text", "cap");
  input("Gross receipts, latest year", year(R.turnover, "B"), "money", "gr", !R.turnover);
  // Only professionals are lent to on a multiple of receipts.
  const professional = String(data.income?.profile ?? "") === "Self-employed professional";
  if (professional) {
    input("Type of professional (Doctor, Architect, Chartered Accountant)", "Doctor", "text", "ptype");
    ws.getCell(k.ptype!.replace(/\$/g, "")).dataValidation = { type: "list", allowBlank: false, formulae: ['"Doctor,Architect,Chartered Accountant"'] };
    input("Multiplier on gross receipts", fx(`IF(${k.ptype}="Doctor",3,IF(${k.ptype}="Architect",2,1.5))`), "text", "mult", false);
    input("Principal outstanding on other loans", rows(data, "obligations", "loans").filter((l) => String(l.status ?? "Live") === "Live").reduce((s, l) => s + num(l.outstanding ?? l.sanctioned), 0), "money", "pos");
  }
  input("Average bank balance", a.bankingDetail.abb ?? a.banking.recentAvgBalance ?? a.banking.avgBalance ?? 0, "money", "abb");
  input("Balance must be this many times the new EMI", business ? 1.25 : 2, "text", "abbTimes");
  const live = rows(data, "obligations", "loans").filter((l) => String(l.status ?? "Live") === "Live");
  const base = live.sort((x, y) => num(y.paid) - num(x.paid))[0];
  input("EMI of the base loan (longest clean track)", num(base?.emi), "money", "baseEmi");
  input("Months already paid on the base loan", num(base?.paid), "number", "baseMob");
  input("Multiplier on the base EMI", fx(`IF(${k.baseMob}>=24,1.4,IF(${k.baseMob}>=12,1.2,0))`), "text", "surMult", false);

  r = kit.heading(ws, r + 1, "What each method supports", 5);
  kit.tableHeader(ws, r, ["Method", "Monthly income / basis", "EMI available", "Loan it supports", "Against the ask"]);
  r += 1;
  const first = r;
  const method = (label: string, basis: string, emiFormula: string, loanFormula?: string) => {
    cell(ws, `A${r}`, label, "text", { bold: true });
    cell(ws, `B${r}`, fx(basis), "money");
    cell(ws, `C${r}`, emiFormula ? fx(emiFormula) : null, "money");
    cell(ws, `D${r}`, fx(loanFormula ?? `IFERROR(PV(${k.rate}/1200,${k.n},-C${r}),0)`), "money", { bold: true });
    cell(ws, `E${r}`, fx(`IF(N(D${r})=0,"Figures missing or condition not met",IF(${k.ask}=0,"-",IF(D${r}>=${k.ask},"Covers it","Short by "&TEXT(${k.ask}-D${r},"#,##0"))))`));
    r += 1;
  };
  const byIncome = () => `MAX(0,B${r}*${k.foir}/100-${k.emi})`;
  const capped = (now: string, before: string) => `IF(${before}>0,MIN(${now},${before}*${k.cap}),${now})`;
  method(
    "Net profit (depreciation, remuneration, closing interest, rent)",
    `(${capped(k.np1!, k.np0!)}+${k.dep}*${k.depShare}/100+${k.rem}+${k.intc})/12+${k.rent}*${k.rentShare}/100`,
    byIncome(),
  );
  method("Gross profit (less working-capital interest and tax)", `MAX(0,${capped(k.gp1!, k.gp0!)}-${k.wcint}-${k.tax})/12+${k.rent}*${k.rentShare}/100`, byIncome());
  method("Average bank balance", `${k.abb}`, `IFERROR(B${r}/${k.abbTimes},0)`);
  method("Repayment track (12 months paid or more)", `${k.baseEmi}`, `B${r}*${k.surMult}`);
  if (professional) method("Gross receipts multiplier (less other loans outstanding)", `${k.gr}`, "", `MAX(0,B${r}*${k.mult}-${k.pos})`);
  const last = r - 1;
  cell(ws, `A${r}`, "Highest of the methods", "text", { bold: true });
  cell(ws, `D${r}`, fx(`MAX(D${first}:D${last})`), "money", { bold: true });
  r += 1;
  cell(ws, `A${r}`, "Method giving the highest figure", "text", { bold: true });
  cell(ws, `D${r}`, fx(`INDEX(A${first}:A${last},MATCH(MAX(D${first}:D${last}),D${first}:D${last},0))`));
  const highest = `D${r - 1}`;

  if (family === "HOME" || family === "LAP") {
    r = kit.heading(ws, r + 2, "Limit set by the property value", 5);
    const value = a.property.value ?? 0;
    cell(ws, `A${r}`, "Property value");
    cell(ws, `B${r}`, value, "money", { input: true });
    const v = `$B$${r}`;
    r += 1;
    cell(ws, `A${r}`, family === "HOME" ? "Share of value that may be lent (RBI slab for the loan amount)" : "Share of value that may be lent (residential 70, commercial 65, industrial 55)");
    cell(ws, `B${r}`, family === "HOME" ? fx(`IF(${k.ask}<=3000000,90,IF(${k.ask}<=7500000,80,75))`) : /commercial|shop|office/i.test(String(data.property?.type ?? "")) ? 65 : /industrial|factory|warehouse/i.test(String(data.property?.type ?? "")) ? 55 : 70, "percent", { input: family !== "HOME" });
    const share = `$B$${r}`;
    r += 1;
    cell(ws, `A${r}`, "Loan the property supports", "text", { bold: true });
    cell(ws, `D${r}`, fx(`${v}*${share}/100`), "money", { bold: true });
    r += 1;
    cell(ws, `A${r}`, "Eligible: the lower of income and property", "text", { bold: true });
    cell(ws, `D${r}`, fx(`IF(${v}>0,MIN(${highest},D${r - 1}),${highest})`), "money", { bold: true });
    cell(ws, `E${r}`, fx(`IF(${k.ask}=0,"-",IF(D${r}>=${k.ask},"Covers it","Short by "&TEXT(${k.ask}-D${r},"#,##0")))`));
  }
}

function rtrSheet(wb: ExcelJS.Workbook, kit: Kit, data: CamData, sub: string) {
  const loans = rows(data, "obligations", "loans");
  if (!loans.length) return;
  const ws = kit.sheet(wb, "Repayment track", "REPAYMENT TRACK AND LIABILITIES (RTR)", `${sub}. Change "Count" to Yes or No to include or leave out a loan's EMI.`, [26, 20, 16, 16, 14, 10, 10, 10, 12, 14, 10, 10, 14, 16]);
  kit.tableHeader(ws, 4, ["Lender", "Loan type", "Original", "Outstanding", "EMI", "Paid", "Left", "Tenor", "% done", "Tenor band", "Bounces", "30+ days", "Count", "EMI counted"]);
  let r = 5;
  const first = r;
  for (const l of loans) {
    cell(ws, `A${r}`, String(l.lender ?? ""));
    cell(ws, `B${r}`, String(l.type ?? ""));
    cell(ws, `C${r}`, num(l.sanctioned) || null, "money", { input: true });
    cell(ws, `D${r}`, num(l.outstanding) || null, "money", { input: true });
    cell(ws, `E${r}`, num(l.emi) || null, "money", { input: true });
    cell(ws, `F${r}`, num(l.paid) || null, "number", { input: true });
    cell(ws, `G${r}`, num(l.monthsLeft) || null, "number", { input: true });
    cell(ws, `H${r}`, fx(`IF(N(F${r})+N(G${r})=0,"-",N(F${r})+N(G${r}))`), "number");
    cell(ws, `I${r}`, fx(`IFERROR(N(F${r})/H${r}*100,"-")`), "percent");
    cell(ws, `J${r}`, fx(`IF(NOT(ISNUMBER(I${r})),"-",IF(I${r}<=25,"0-25%",IF(I${r}<=50,"26-50%",IF(I${r}<=75,"51-75%","76-100%"))))`));
    cell(ws, `K${r}`, num(l.bounces) || 0, "number", { input: true });
    cell(ws, `L${r}`, num(l.dpd30) || 0, "number", { input: true });
    const counted = String(l.status ?? "Live") === "Live" && String(l.foir ?? "Yes") !== "No" ? "Yes" : "No";
    cell(ws, `M${r}`, counted, "text", { input: true });
    ws.getCell(`M${r}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"Yes,No"'] };
    cell(ws, `N${r}`, fx(`IF(M${r}="Yes",N(E${r}),0)`), "money");
    r += 1;
  }
  const last = r - 1;
  cell(ws, `A${r}`, "Total", "text", { bold: true });
  for (const c of ["C", "D", "E", "N"]) cell(ws, `${c}${r}`, fx(`SUM(${c}${first}:${c}${last})`), "money", { bold: true });
  for (const c of ["K", "L"]) cell(ws, `${c}${r}`, fx(`SUM(${c}${first}:${c}${last})`), "number", { bold: true });
  r += 2;
  cell(ws, `A${r}`, "Loans with a bounce or a delay", "text", { bold: true });
  cell(ws, `B${r}`, fx(`SUMPRODUCT(--((K${first}:K${last}+L${first}:L${last})>0))`), "number");
  cell(ws, `A${r + 1}`, "Track", "text", { bold: true });
  cell(ws, `B${r + 1}`, fx(`IF(B${r}=0,"Clean","Needs explaining")`));
}

function mpbfSheet(wb: ExcelJS.Workbook, kit: Kit, data: CamData, sub: string) {
  const ws = kit.sheet(wb, "Working capital MPBF", "WORKING CAPITAL LIMIT (MPBF)", `${sub}. Maximum permissible bank finance by the three usual methods.`, [48, 20]);
  const bs = rows(data, "income", "balanceSheet")[0] ?? {};
  const inc = data.income ?? {};
  let r = kit.heading(ws, 4, "Inputs");
  const k: Record<string, string> = {};
  const input = (label: string, v: number, fmt: Fmt, key: string) => {
    cell(ws, `A${r}`, label);
    cell(ws, `B${r}`, v, fmt, { input: true });
    k[key] = `B${r}`;
    r += 1;
  };
  input("Current assets", num(bs.currentAssets), "money", "ca");
  input("Current liabilities other than bank borrowing", num(bs.currentLiabilities), "money", "ocl");
  input("Expected turnover for the coming year", num(inc.projectedSales) || num(rows(data, "income", "financials")[0]?.turnover), "money", "sales");
  input("Working capital as a share of turnover", 25, "percent", "wc");
  input("Bank's share of turnover", 20, "percent", "bank");
  input("Limits already enjoyed", num(inc.existingWcLimit), "money", "have");
  r = kit.heading(ws, r + 1, "Limit by method");
  const out = (label: string, formula: string, key: string) => {
    cell(ws, `A${r}`, label, "text", { bold: true });
    cell(ws, `B${r}`, fx(formula), "money", { bold: true });
    k[key] = `B${r}`;
    r += 1;
  };
  out("Method I: 75% of the working capital gap", `MAX(0,0.75*(${k.ca}-${k.ocl}))`, "m1");
  out("Method II: 75% of current assets less other liabilities", `MAX(0,0.75*${k.ca}-${k.ocl})`, "m2");
  out("Turnover method: bank's share of expected turnover", `${k.sales}*${k.bank}/100`, "m3");
  out("Turnover method: working capital needed", `${k.sales}*${k.wc}/100`, "need");
  out("Margin the borrower must bring (turnover method)", `MAX(0,${k.need}-${k.m3})`, "margin");
  out("Room left over existing limits (turnover method)", `MAX(0,${k.m3}-${k.have})`, "room");
}

function fundFlowSheet(wb: ExcelJS.Workbook, kit: Kit, at: Record<string, number>, sub: string) {
  const ws = kit.sheet(wb, "Fund flow", "FUND FLOW (LATEST YEAR AGAINST THE ONE BEFORE)", `${sub}. Taken from the Ratios sheet.`, [48, 20]);
  const d = (k: string) => `(N(Ratios!B${at[k]})-N(Ratios!C${at[k]}))`;
  let r = kit.heading(ws, 4, "Where money came from");
  const first = r;
  const line = (label: string, formula: string) => {
    cell(ws, `A${r}`, label);
    cell(ws, `B${r}`, fx(formula), "money");
    r += 1;
  };
  line("Cash profit of the latest year", `N(Ratios!B${at.netProfit})+N(Ratios!B${at.depreciation})`);
  line("Increase in bank / NBFC loans", d("bankDebt"));
  line("Increase in unsecured loans", d("highCostDebt"));
  line("Increase in promoter loans", d("promoterLoans"));
  line("Increase in creditors", d("creditors"));
  const last = r - 1;
  cell(ws, `A${r}`, "Total sources", "text", { bold: true });
  cell(ws, `B${r}`, fx(`SUM(B${first}:B${last})`), "money", { bold: true });
  const src = r;
  r = kit.heading(ws, r + 2, "Where it went");
  const f2 = r;
  line("Increase in debtors", d("debtors"));
  line("Increase in stock", d("inventory"));
  line("Increase in other current assets", `${d("currentAssets")}-${d("debtors")}-${d("inventory")}`);
  const l2 = r - 1;
  cell(ws, `A${r}`, "Total uses", "text", { bold: true });
  cell(ws, `B${r}`, fx(`SUM(B${f2}:B${l2})`), "money", { bold: true });
  cell(ws, `A${r + 2}`, "Not explained by these lines (drawings, fixed assets, investments)", "text", { bold: true });
  cell(ws, `B${r + 2}`, fx(`B${src}-B${r}`), "money", { bold: true });
}

/** The month-by-month repayment of the loan asked for, so any change in amount, rate or tenure shows at once. */
function scheduleSheet(wb: ExcelJS.Workbook, kit: Kit, a: Analysis, sub: string) {
  const ws = kit.sheet(wb, "Repayment schedule", "REPAYMENT SCHEDULE OF THE PROPOSED LOAN", `${sub}. Change the yellow cells.`, [12, 20, 18, 18, 20]);
  const n = Math.min(Math.max(a.tenureMonths || 12, 1), 360);
  cell(ws, "A4", "Loan");
  cell(ws, "B4", a.requested ?? 0, "money", { input: true });
  cell(ws, "A5", "Rate %");
  cell(ws, "B5", a.rate, "percent", { input: true });
  cell(ws, "A6", "Months");
  cell(ws, "B6", n, "number", { input: true });
  cell(ws, "A7", "EMI", "text", { bold: true });
  cell(ws, "B7", fx("IFERROR(PMT(B5/1200,B6,-B4),0)"), "money", { bold: true });
  cell(ws, "C4", "Total interest");
  kit.tableHeader(ws, 9, ["Month", "EMI", "Interest", "Principal", "Balance after"]);
  for (let i = 1; i <= 360; i++) {
    const r = 9 + i;
    const prev = i === 1 ? "$B$4" : `E${r - 1}`;
    cell(ws, `A${r}`, fx(`IF(${i}<=$B$6,${i},"")`), "number");
    cell(ws, `B${r}`, fx(`IF(A${r}="","",MIN($B$7,N(${prev})*(1+$B$5/1200)))`), "money");
    cell(ws, `C${r}`, fx(`IF(A${r}="","",N(${prev})*$B$5/1200)`), "money");
    cell(ws, `D${r}`, fx(`IF(A${r}="","",B${r}-C${r})`), "money");
    cell(ws, `E${r}`, fx(`IF(A${r}="","",MAX(0,N(${prev})-D${r}))`), "money");
  }
  cell(ws, "D4", fx("SUM(C10:C369)"), "money", { bold: true });
}

/** The pass / fail checks a lender's own CAM runs before it looks at the amount. */
function checksSheet(wb: ExcelJS.Workbook, kit: Kit, family: Family, data: CamData, a: Analysis, at: Record<string, number>, sub: string) {
  const ws = kit.sheet(wb, "Policy checks", "LENDER-STYLE CHECKS", `${sub}. Yellow cells are the limits: set them to the lender being approached.`, [46, 18, 14, 16, 16]);
  kit.tableHeader(ws, 4, ["Check", "Case figure", "Rule", "Limit", "Result"]);
  let r = 5;
  const check = (label: string, figure: ExcelJS.CellValue, fmt: Fmt, rule: "at least" | "at most", limit: number) => {
    cell(ws, `A${r}`, label);
    cell(ws, `B${r}`, figure, fmt, { input: typeof figure !== "object" });
    cell(ws, `C${r}`, rule);
    cell(ws, `D${r}`, limit, "number", { input: true });
    ws.getCell(`D${r}`).numFmt = "General";
    cell(ws, `E${r}`, fx(`IF(NOT(ISNUMBER(B${r})),"Not known",IF(${rule === "at least" ? `B${r}>=D${r}` : `B${r}<=D${r}`},"Pass","Fail"))`), "text", { bold: true });
    r += 1;
  };
  const age = ageOn(data.applicant?.dob, new Date());
  const bureau = num(data.obligations?.cibilScore);
  const vintage = num(data.income?.vintageYears);
  const abb = a.bankingDetail.abb ?? a.banking.recentAvgBalance ?? a.banking.avgBalance;
  const unsecured = rows(data, "obligations", "loans").filter((l) => String(l.status ?? "Live") === "Live" && /personal|business/i.test(String(l.type ?? ""))).length;
  const bounces = rows(data, "obligations", "loans").reduce((s, l) => s + num(l.bounces), 0);
  const ratio = (key: string, c = "B") => (at[key] ? fx(`IFERROR(Ratios!${c}${at[key]},"-")`) : null);
  check("Credit score", bureau || null, "number", "at least", 700);
  if (age) {
    check("Age at application (youngest allowed)", age, "number", "at least", 25);
    check("Age when the loan ends", age + Math.round(a.tenureMonths / 12), "number", "at most", 65);
  }
  check("Years in the business", vintage || null, "number", "at least", 3);
  check("Running unsecured loans", unsecured, "number", "at most", 3);
  check("Bounces on running loans", bounces, "number", "at most", 0);
  check("Average bank balance as a multiple of the new EMI", abb !== null && abb !== undefined && a.proposedEmi ? Math.round((abb / a.proposedEmi) * 100) / 100 : null, "ratio", "at least", family === "BUSINESS" ? 1.25 : 2);
  if (at.netProfit) {
    check("Current ratio", ratio("Current ratio"), "ratio", "at least", 1.17);
    check("Debt to equity", ratio("Debt to equity"), "ratio", "at most", 3);
    check("Total outside liabilities / net worth", ratio("Total outside liabilities / net worth"), "ratio", "at most", 3);
    // A blank figure is unknown, not zero.
    check("Debtor days", fx(`IF(COUNT(Ratios!B${at.debtors})=0,"-",IFERROR(Ratios!B${at["Debtor days"]},"-"))`), "number", "at most", 120);
    check("Turnover change on the year before (%)", ratio("Turnover growth over the year before"), "number", "at least", -10);
    const B = `Ratios!B${at.netProfit}`;
    check("Cash profit change on the year before (%)", fx(`IFERROR(((Ratios!B${at.netProfit}+Ratios!B${at.depreciation})/(Ratios!C${at.netProfit}+Ratios!C${at.depreciation})-1)*100,"-")`), "number", "at least", -5);
    const yearly = (a.existingEmi + (a.proposedEmi ?? 0)) * 12;
    check("Debt service cover (cash profit + interest) / yearly EMIs", yearly > 0 ? fx(`IF(COUNT(${B})=0,"-",IFERROR((${B}+Ratios!B${at.depreciation}+Ratios!B${at.interestPaid})/${Math.round(yearly)},"-"))`) : null, "ratio", "at least", 1.25);
  }
  const last = r - 1;
  r += 1;
  cell(ws, `A${r}`, "Checks failed", "text", { bold: true });
  cell(ws, `B${r}`, fx(`COUNTIF(E5:E${last},"Fail")`), "number", { bold: true });
  cell(ws, `A${r + 1}`, "Checks that cannot be judged yet", "text", { bold: true });
  cell(ws, `B${r + 1}`, fx(`COUNTIF(E5:E${last},"Not known")`), "number", { bold: true });
}

const SOURCES: [string, string, string][] = [
  ["A year counts for at most 1.5 times the year before", "Net profit and gross profit methods", "Lender LAP CAM supplied to GCS (vanilla and gross-profit sheets)"],
  ["70% of rental income counted", "Income methods", "Lender LAP CAM supplied to GCS; lender sheet using 75% also seen"],
  ["Receipts multiplier: doctor 3, architect 2, chartered accountant 1.5", "Gross receipts method", "Lender LAP CAM supplied to GCS"],
  ["Balance 2 times the EMI (property loans), 1.25 times (business loans)", "Bank balance method", "Lender CAMs supplied to GCS (LAP; business loan program 1.1 to 1.25)"],
  ["Base EMI x 1.2 after 12 months paid, x 1.4 after 24", "Repayment track method", "NBFC business-loan CAM supplied to GCS"],
  ["66% of depreciation below ₹15 crore turnover", "Business-loan net profit", "NBFC business-loan CAM supplied to GCS"],
  ["Age 25 to 65, 3 years in business, debtor days up to 120, turnover down 10% and cash profit down 5% at most", "Policy checks", "NBFC business-loan CAM supplied to GCS"],
  ["Current ratio 1.17 floor (1.33 usual), debt/equity and outside liabilities up to 3, DSCR 1.25", "Policy checks", "Common bank benchmarks from published bank policy and appraisal material; not an RBI rule, varies by lender"],
  ["Home loan share of value: 90% to ₹30 lakh, 80% to ₹75 lakh, 75% above", "Property limit", "RBI slabs as reported by lenders; check the current circular"],
  ["Property loan share of value: residential 70, commercial 65, industrial 55", "Property limit", "Lender LAP CAM supplied to GCS and published lender ranges"],
  ["Working capital 25% of turnover, bank 20%, borrower 5% (limits up to ₹5 crore)", "Working capital", "Nayak Committee turnover method"],
  ["EMI share of income (FOIR)", "All income methods", "The CRM's product default; published ranges are 55 to 65% for the self-employed"],
];

function sourcesSheet(wb: ExcelJS.Workbook, kit: Kit, sub: string) {
  const ws = kit.sheet(wb, "Sources", "WHERE THE ASSUMPTIONS COME FROM", `${sub}. Each is a starting point: the lender's own policy decides.`, [70, 32, 70]);
  kit.tableHeader(ws, 4, ["Assumption", "Used in", "Source"]);
  SOURCES.forEach(([what, where, from], i) => {
    const r = 5 + i;
    for (const [c, v] of [["A", what], ["B", where], ["C", from]] as const) cell(ws, `${c}${r}`, v).alignment = { wrapText: true, vertical: "top" };
  });
}

/** Which extra sheets a case gets, by product and kind of customer. */
export function extraSheetsFor(family: Family, a: Pick<Analysis, "profile">): string[] {
  const self = a.profile === "SELF_EMPLOYED" || (a.profile === null && family === "BUSINESS");
  const out: string[] = [];
  if (self) out.push("Ratios", "Eligibility methods");
  out.push("Repayment track");
  if (family === "BUSINESS") out.push("Working capital MPBF");
  if (self && (family === "BUSINESS" || family === "LAP")) out.push("Fund flow");
  out.push("Policy checks", "Repayment schedule", "Sources");
  return out;
}

export function addExtraSheets(wb: ExcelJS.Workbook, kit: Kit, family: Family, data: CamData, a: Analysis, sub: string) {
  const wanted = extraSheetsFor(family, a);
  let at: Record<string, number> = {};
  if (wanted.includes("Ratios")) at = ratiosSheet(wb, kit, data, sub);
  if (wanted.includes("Eligibility methods")) methodsSheet(wb, kit, family, data, a, sub, at);
  rtrSheet(wb, kit, data, sub);
  if (wanted.includes("Working capital MPBF")) mpbfSheet(wb, kit, data, sub);
  if (wanted.includes("Fund flow")) fundFlowSheet(wb, kit, at, sub);
  checksSheet(wb, kit, family, data, a, at, sub);
  scheduleSheet(wb, kit, a, sub);
  sourcesSheet(wb, kit, sub);
  // Excel works the formulas out when the file is opened.
  wb.calcProperties.fullCalcOnLoad = true;
}
