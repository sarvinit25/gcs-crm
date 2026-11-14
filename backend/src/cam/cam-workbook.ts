import ExcelJS from "exceljs";
import { loanForEmi } from "../credit-evaluation/credit-calcs";
import { type Analysis } from "./cam-analysis";
import { FAMILY_LABEL, missingCore, sectionsFor, visible, type CamData, type Family, type Field, type Section } from "./cam-schema";

// The Excel CAM: one sheet per part of the appraisal, so an analyst can read it top to bottom or jump to one sheet. The
// eligibility, banking and GST sheets carry live formulas: change a yellow cell and the figures under it recalculate.

const NAVY = "FF0B1849";
const GOLD = "FFE4B028";
const PALE = "FFF7F8FA";
const LINE = "FFD7DCE5";
const INPUT = "FFFFF4C2";
const RED = "FFFBE3E3";
const AMBER = "FFFFF1CC";
const GREEN = "FFE0F3E6";

/** Indian digit grouping (12,34,567) through a conditional format; a plain #,##,##0 would group in thousands. */
const RUPEE = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"##,##0';
const PCT = '0.0"%"';

export type CamBookInput = {
  lead: { leadNo: number; name: string; phone: string; email: string | null; city: string | null; productName: string | null; source: string | null };
  family: Family;
  data: CamData;
  analysis: Analysis;
  match: { lender: string; status: string; score: number | null; reasons: string; checks: string }[] | null;
  matchNote: string | null;
  company: { name: string; phone: string; email: string };
  generatedBy: string;
  generatedAt: string;
  customerSubmittedAt: string | null;
};

type WS = ExcelJS.Worksheet;
const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const border: Partial<ExcelJS.Borders> = { top: { style: "thin", color: { argb: LINE } }, bottom: { style: "thin", color: { argb: LINE } }, left: { style: "thin", color: { argb: LINE } }, right: { style: "thin", color: { argb: LINE } } };

function sheet(wb: ExcelJS.Workbook, name: string, title: string, subtitle: string, widths: number[]): WS {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }], properties: { tabColor: { argb: GOLD } }, pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const last = Math.max(widths.length, 2);
  ws.mergeCells(1, 1, 1, last);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  t.fill = solid(NAVY);
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, last);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
  s.alignment = { indent: 1 };
  return ws;
}

function heading(ws: WS, row: number, text: string, cols = 2) {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, size: 11, color: { argb: NAVY } };
  c.fill = solid("FFFCEFC4");
  c.alignment = { indent: 1 };
  ws.getRow(row).height = 20;
  return row + 1;
}

type Fmt = "money" | "percent" | "text" | "number";
function put(cell: ExcelJS.Cell, value: unknown, fmt: Fmt = "text") {
  if (value === null || value === undefined || value === "") { cell.value = null; return; }
  cell.value = value as ExcelJS.CellValue;
  if (fmt === "money") cell.numFmt = RUPEE;
  else if (fmt === "percent") cell.numFmt = PCT;
  else if (fmt === "number") cell.numFmt = "#,##0.##";
}

/** Label / value rows. Returns the next free row. */
function pairs(ws: WS, start: number, items: [string, unknown, Fmt?][], valueCol = 2): number {
  let r = start;
  for (const [label, value, fmt] of items) {
    const l = ws.getCell(r, 1);
    l.value = label;
    l.font = { color: { argb: "FF374151" } };
    l.fill = solid(PALE);
    l.border = border;
    l.alignment = { vertical: "top", wrapText: true, indent: 1 };
    const v = ws.getCell(r, valueCol);
    put(v, value, fmt ?? "text");
    v.border = border;
    v.alignment = { vertical: "top", wrapText: true, horizontal: typeof value === "number" ? "right" : "left" };
    v.font = { bold: true };
    r += 1;
  }
  return r;
}

function tableHeader(ws: WS, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = solid(NAVY);
    c.alignment = { wrapText: true, vertical: "middle", horizontal: i === 0 ? "left" : "center" };
    c.border = border;
  });
  ws.getRow(row).height = 32;
}

const formatOf = (type: string): Fmt => (type === "money" ? "money" : type === "percent" ? "percent" : type === "number" ? "number" : "text");
const show = (f: Field, v: unknown): unknown => (f.type === "date" && typeof v === "string" ? new Date(`${v}T00:00:00Z`) : v);

/** Every visible question of a section as label / answer rows. */
function sectionPairs(ws: WS, start: number, section: Section, data: CamData): number {
  const items: [string, unknown, Fmt?][] = [];
  for (const f of section.fields) {
    if (!visible(f.show, data)) continue;
    const v = data[section.id]?.[f.key];
    const cell: [string, unknown, Fmt?] = [f.label, show(f, v ?? null), formatOf(f.type)];
    items.push(cell);
  }
  const next = pairs(ws, start, items);
  // dates need a format on the value cell
  for (let r = start; r < next; r++) { const c = ws.getCell(r, 2); if (c.value instanceof Date) c.numFmt = "dd mmm yyyy"; }
  return next;
}

function tableRows(data: CamData, section: string, table: string): Record<string, unknown>[] {
  return ((data[section]?.[table] as Record<string, unknown>[] | undefined) ?? []).filter(Boolean);
}

function put2(ws: WS, row: number, col: number, value: unknown, fmt: Fmt = "text", bold = false) {
  const c = ws.getCell(row, col);
  put(c, value, fmt);
  c.border = border;
  c.font = { bold };
  c.alignment = { horizontal: typeof value === "number" || (typeof value === "object" && value !== null && "formula" in (value as object)) ? "right" : "left", wrapText: true, vertical: "top" };
  return c;
}

const colLetter = (n: number) => String.fromCharCode(64 + n);

/** Any table of the form as a sheet table: headers from the question list, one row per answer. Returns the next free row. */
function schemaTable(ws: WS, start: number, section: Section | undefined, key: string, data: CamData, empty: string): number {
  const t = section?.tables.find((x) => x.key === key);
  if (!t || !section) return start;
  tableHeader(ws, start, t.columns.map((c) => c.label));
  let r = start + 1;
  const list = tableRows(data, section.id, key);
  if (!list.length) { ws.getCell(r, 1).value = empty; return r + 1; }
  for (const row of list) {
    t.columns.forEach((c, i) => {
      const v = row[c.key] ?? null;
      const cell = put2(ws, r, i + 1, c.type === "date" && typeof v === "string" ? new Date(`${v}T00:00:00Z`) : v, formatOf(c.type));
      if (cell.value instanceof Date) cell.numFmt = "dd mmm yyyy";
    });
    r += 1;
  }
  return r;
}

const note = (ws: WS, row: number, cols: number, text: string, height = 28) => {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
  c.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(row).height = height;
  return row + 1;
};

function flagFill(level: "risk" | "watch" | "good") { return solid(level === "risk" ? RED : level === "watch" ? AMBER : GREEN); }

export async function buildCamWorkbook(b: CamBookInput): Promise<Buffer> {
  const { lead, family, data, analysis: a } = b;
  const wb = new ExcelJS.Workbook();
  wb.creator = b.company.name || "Growth Capital Services";
  wb.created = new Date();
  const sub = `${lead.name} · ${FAMILY_LABEL[family]} · generated ${b.generatedAt} by ${b.generatedBy}`;
  const secs = sectionsFor(family);
  const sec = (id: string) => secs.find((s) => s.id === id);

  // ── 1. Summary ──
  {
    const ws = sheet(wb, "Summary", "CREDIT APPRAISAL MEMO", sub, [38, 30, 30, 30]);
    let r = heading(ws, 4, "Case", 4);
    r = pairs(ws, r, [
      ["Prepared for", b.company.name],
      ["Lead number", lead.leadNo, "number"],
      ["Applicant", data.applicant?.fullName ?? lead.name],
      ["Mobile", lead.phone],
      ["City", data.applicant?.city ?? lead.city],
      ["Loan type", lead.productName ?? FAMILY_LABEL[family]],
      ["Customer's form", b.customerSubmittedAt ? `Submitted ${b.customerSubmittedAt}` : "Not yet submitted by the customer"],
    ]);
    r += 1;
    r = heading(ws, r, "The loan and the numbers", 4);
    r = pairs(ws, r, [
      ["Loan asked for", a.requested, "money"],
      ["Tenure (months)", a.tenureMonths, "number"],
      ["Income considered, per month", a.monthlyIncome, "money"],
      ["How that income was taken", a.incomeBasis],
      ["Running EMIs counted (loans + 5% of card dues)", a.existingEmi, "money"],
      [`Rate used${a.rateIsAssumed ? " (our assumption)" : ""}`, a.rate, "percent"],
      ["EMI on the loan asked for", a.proposedEmi, "money"],
      [`Repayment after the loan, % of income (ceiling ${a.foirCeiling}%${a.ceilingIsAssumed ? ", our assumption" : ""})`, a.foirAfter, "percent"],
      ["Loan the income supports", a.eligible, "money"],
      ["Property value used", a.property.value, "money"],
      ["Loan as % of property value", a.property.ltv, "percent"],
      ["CIBIL score", a.cibil, "number"],
      ["Average monthly bank credits (months given)", a.banking.avgCredits12, "money"],
      ["Net worth (assets less loans and card dues)", a.netWorth.net, "money"],
      ["Our indicative score", a.scorecard.percent === null ? "Not enough answers yet" : `${a.scorecard.percent}%, grade ${a.scorecard.grade}`],
      ["Co-applicants (count, and the income they add each month)", a.coApplicants.count ? `${a.coApplicants.count}, ${inr(a.coApplicants.income)}` : "None"],
      ["Loan against cost of property / against market value", a.property.ltvOnCost !== null || a.property.ltvOnMarket !== null ? `${a.property.ltvOnCost ?? "n/a"}% / ${a.property.ltvOnMarket ?? "n/a"}%` : null],
      ["Repayment ratio + loan-to-value (lenders often cap at 130%)", a.doubleWhammy ? `${a.doubleWhammy.total}%` : null],
    ]);
    r += 1;
    r = heading(ws, r, "What stands out", 4);
    if (!a.flags.length) {
      ws.getCell(r, 1).value = "Not enough information yet to raise any flag.";
      r += 1;
    }
    for (const f of a.flags) {
      ws.mergeCells(r, 1, r, 4);
      const c = ws.getCell(r, 1);
      c.value = `${f.level === "risk" ? "RISK" : f.level === "watch" ? "WATCH" : "GOOD"}: ${f.text}`;
      c.fill = flagFill(f.level);
      c.border = border;
      c.alignment = { wrapText: true, indent: 1 };
      r += 1;
    }
    r += 1;
    r = heading(ws, r, "Staff recommendation", 4);
    pairs(ws, r, [
      ["Recommendation", data.remarks?.recommendation ?? "Not given yet"],
      ["Lenders to approach", data.remarks?.recommendedLenders],
      ["Recommended amount", data.remarks?.recommendedAmount, "money"],
    ]);
  }

  // ── 2. Applicant ──
  {
    const ws = sheet(wb, "Applicant", "APPLICANT AND LOAN REQUEST", sub, [46, 60, 16, 16, 20, 18, 18, 12]);
    let r = heading(ws, 4, "Applicant");
    r = sectionPairs(ws, r, sec("applicant")!, data);
    r += 1;
    r = heading(ws, r, "Loan requirement");
    r = sectionPairs(ws, r, sec("loanRequest")!, data);
    r += 1;
    r = heading(ws, r, "Co-applicants and guarantors", 8);
    r = schemaTable(ws, r, sec("loanRequest"), "coApplicants", data, "None named.");
    const refs = tableRows(data, "references", "people");
    if (refs.length) {
      r += 1;
      r = heading(ws, r, "References", 2);
      refs.forEach((x, i) => { r = pairs(ws, r, [[`Reference ${i + 1}`, [x.name, x.relation, x.phone, x.city].filter(Boolean).join(" · ")]]); });
    }
  }

  // ── 3. Income ──
  if (sec("income")) {
    const ws = sheet(wb, "Income", "EMPLOYMENT AND INCOME", sub, [30, 17, 17, 17, 17, 17, 17, 17]);
    let r = heading(ws, 4, "Profile", 2);
    r = sectionPairs(ws, r, sec("income")!, data);
    if (a.financials.length) {
      r += 1;
      r = heading(ws, r, "Business financials, with the ratios an analyst reads", 8);
      tableHeader(ws, r, ["Financial year", "Turnover", "Net profit", "Net margin", "Cash profit", "Turnover growth", "Depreciation", "Interest paid"]);
      r += 1;
      const raw = tableRows(data, "income", "financials");
      a.financials.forEach((f, i) => {
        put2(ws, r, 1, f.year);
        put2(ws, r, 2, f.turnover, "money");
        put2(ws, r, 3, f.netProfit, "money");
        put2(ws, r, 4, f.margin, "percent");
        put2(ws, r, 5, f.cashProfit, "money", true);
        put2(ws, r, 6, f.growth, "percent");
        put2(ws, r, 7, raw[i]?.depreciation ?? null, "money");
        put2(ws, r, 8, raw[i]?.interestPaid ?? null, "money");
        r += 1;
      });
      r += 1;
      ws.mergeCells(r, 1, r, 8);
      ws.getCell(r, 1).value = "Cash profit = net profit + depreciation + interest paid + partner / director remuneration. The Income programs sheet shows this beside the other ways lenders take a business's income.";
      ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
      ws.getCell(r, 1).alignment = { wrapText: true };
      ws.getRow(r).height = 28;
    }
  }

  // ── 3b. Income programs ──
  if (a.programs.length || a.coApplicants.count || a.bankingProgram || a.workingCapital) {
    const ws = sheet(wb, "Income programs", "INCOME PROGRAMS AND ELIGIBILITY WORKINGS", `${sub}. Lenders take income in different ways: this shows each one. Yellow cells can be changed.`, [46, 20, 20, 70]);
    let r = 4;
    if (a.programs.length) {
      r = heading(ws, r, "Ways the income can be taken", 4);
      tableHeader(ws, r, ["Program", "Income in a year", "Income a month", "How it is worked out"]);
      r += 1;
      const top = a.program.highest;
      for (const p of a.programs) {
        put2(ws, r, 1, p.label + (p.label === a.program.chosen ? "  (used for the repayment capacity)" : ""), "text", p.label === a.program.chosen);
        put2(ws, r, 2, p.annual === null ? null : Math.round(p.annual), "money");
        put2(ws, r, 3, p.annual === null ? null : { formula: `B${r}/12`, result: p.annual / 12 } as never, "money", true);
        put2(ws, r, 4, p.note);
        if (p.label === top) for (let c = 1; c <= 4; c++) ws.getCell(r, c).fill = solid(GREEN);
        r += 1;
      }
      r = note(ws, r, 4, `The green row is the highest. The repayment capacity uses "${a.program.chosen}" unless the staff assessment picks another program. Profit that jumps more than 35% on the year before is averaged with it, and the margin caps are 15% for trading and manufacturing, 30% for services: the rules in the lender-style sheets we compared against.`, 40);
      r += 1;
    }
    r = heading(ws, r, "Co-applicants", 4);
    r = pairs(ws, r, [
      ["Number of co-applicants", a.coApplicants.count, "number"],
      ["Income they add each month", a.coApplicants.income, "money"],
      ["EMIs they pay each month", a.coApplicants.emi, "money"],
      ["Lowest CIBIL score among them", a.coApplicants.lowestCibil, "number"],
      ["Oldest person's age at the end of the loan", a.coApplicants.oldestAgeAtMaturity, "number"],
    ]);
    r += 1;
    if (a.bankingProgram || a.doubleWhammy) {
      r = heading(ws, r, "Banking program: what the average balance alone supports", 4);
      const rowOf = (label: string, value: number | null, fmt: Fmt, input: boolean) => {
        put2(ws, r, 1, label).fill = solid(PALE);
        const c = put2(ws, r, 2, value, fmt, true);
        if (input) c.fill = solid(INPUT);
        r += 1;
        return r - 1;
      };
      if (a.bankingProgram) {
        const bp = a.bankingProgram;
        const rAbb = rowOf("Average bank balance, a month", bp.abb, "money", true);
        const rLtv = rowOf("Loan as % of the property value", bp.ltvPct, "percent", true);
        const rCap = rowOf("Repayment and loan-to-value together may not pass, %", 130, "percent", true);
        put2(ws, r, 1, "Highest repayment ratio allowed, %").fill = solid(PALE);
        put2(ws, r, 2, { formula: `MAX(0,B${rCap}-B${rLtv})`, result: bp.maxFoirPct } as never, "percent", true); const rFoir = r; r += 1;
        put2(ws, r, 1, "Highest EMI the balance supports").fill = solid(PALE);
        put2(ws, r, 2, { formula: `B${rFoir}/100*B${rAbb}`, result: bp.maxEmi } as never, "money", true); const rMax = r; r += 1;
        const rEx = rowOf("Running EMIs counted", a.existingEmi, "money", true);
        const rRate = rowOf("Rate a year, %", a.rate, "percent", true);
        const rN = rowOf("Tenure, months", a.tenureMonths, "number", true);
        put2(ws, r, 1, "Loan this supports").fill = solid(PALE);
        put2(ws, r, 2, { formula: `IFERROR(PV(B${rRate}/1200,B${rN},-MAX(0,B${rMax}-B${rEx})),0)`, result: bp.eligible ?? 0 } as never, "money", true); r += 1;
      }
      if (a.doubleWhammy) r = pairs(ws, r, [["Repayment ratio after the loan + loan-to-value", a.doubleWhammy.total, "percent"], ["Limit some lenders apply", a.doubleWhammy.limit, "percent"]]);
      r += 1;
    }
    if (a.workingCapital) {
      const w = a.workingCapital;
      r = heading(ws, r, "Working-capital limit by the turnover method", 4);
      put2(ws, r, 1, "Turnover, latest year").fill = solid(PALE); put2(ws, r, 2, w.turnover, "money", true); const rT = r; r += 1;
      put2(ws, r, 1, "Share of turnover taken as the limit, %").fill = solid(PALE); put2(ws, r, 2, 30, "percent", true).fill = solid(INPUT); const rS = r; r += 1;
      put2(ws, r, 1, "Limit").fill = solid(PALE); put2(ws, r, 2, { formula: `B${rT}*B${rS}/100`, result: w.limit } as never, "money", true); const rL = r; r += 1;
      put2(ws, r, 1, "Share of the limit the bank funds, %").fill = solid(PALE); put2(ws, r, 2, 80, "percent", true).fill = solid(INPUT); const rB = r; r += 1;
      put2(ws, r, 1, "Bank finance possible").fill = solid(PALE); put2(ws, r, 2, { formula: `B${rL}*B${rB}/100`, result: w.bankFinance } as never, "money", true); const rF = r; r += 1;
      put2(ws, r, 1, "Already with a bank").fill = solid(PALE); put2(ws, r, 2, w.existing, "money", true).fill = solid(INPUT); const rE = r; r += 1;
      put2(ws, r, 1, "Room left").fill = solid(PALE); put2(ws, r, 2, { formula: `MAX(0,B${rF}-B${rE})`, result: w.headroom } as never, "money", true); r += 1;
      r = note(ws, r, 4, "30% of turnover with the bank funding four-fifths of it is the rule used in the credit sheet we compared against. Banks vary: change the yellow cells to the lender's own share.", 30);
    }
  }

  // ── 3c. Financial analysis ──
  if (a.financials.length || tableRows(data, "income", "balanceSheet").length) {
    const ws = sheet(wb, "Financial analysis", "FINANCIAL ANALYSIS", `${sub}. Figures from the ITR / balance sheet as entered.`, [40, 18, 18, 18, 18, 18, 18, 18, 18, 18]);
    let r = heading(ws, 4, "Profit and loss", 8);
    r = schemaTable(ws, r, sec("income"), "financials", data, "No years given.");
    r += 1;
    r = heading(ws, r, "Balance sheet", 10);
    r = schemaTable(ws, r, sec("income"), "balanceSheet", data, "No balance sheet figures given.");
    r += 1;
    r = heading(ws, r, "Ratios, latest year", 4);
    const rt = a.ratios;
    r = pairs(ws, r, [
      ["Gross margin, %", rt.grossMarginPct, "percent"],
      ["Operating profit before interest, tax and depreciation (PBDIT), % of turnover", rt.pbditPct, "percent"],
      ["Return on net worth, %", rt.roePct, "percent"],
      ["Debt to net worth, after this loan (times)", rt.debtEquityAfter, "number"],
      ["Current ratio (times)", rt.currentRatio, "number"],
      ["Debtor days", rt.debtorDays, "number"],
      ["Stock days", rt.inventoryDays, "number"],
      ["Creditor days", rt.creditorDays, "number"],
      ["Working-capital gap, days (debtor + stock - creditor)", rt.workingCapitalGapDays, "number"],
      ["Unsecured share of business borrowing, %", rt.highCostDebtPct, "percent"],
      ["Debt service cover, latest year", a.dscr, "number"],
      ["Debt service cover on the expected turnover", rt.projectedDscr, "number"],
    ]);
    note(ws, r + 1, 8, "A debt service cover below 1 means the year's cash did not cover the year's repayments. Debtor, stock and creditor days use turnover and the cost of goods (turnover less gross profit).", 30);
  }

  // ── 4. Obligations ──
  {
    const ws = sheet(wb, "Obligations", "EXISTING LOANS AND CREDIT HISTORY", sub, [26, 22, 18, 18, 16, 14, 16, 22, 12, 12, 14]);
    let r = heading(ws, 4, "Credit history", 7);
    r = pairs(ws, r, [
      ["CIBIL score", data.obligations?.cibilScore ?? null, "number"],
      ["Missed or overdue payment in 12 months", data.obligations?.overdue ?? null],
      ["Details", data.obligations?.overdueDetails ?? null],
      ["Settled / written off / restructured", data.obligations?.settled ?? null],
      ["Credit card limit", data.obligations?.cardLimit ?? null, "money"],
      ["Credit card outstanding", data.obligations?.cardOutstanding ?? null, "money"],
      ["Obligation counted on cards (5% of dues)", a.cardObligation, "money"],
    ]);
    r += 1;
    r = heading(ws, r, "Running loans", 7);
    tableHeader(ws, r, ["Lender", "Type", "Original loan", "Outstanding", "Monthly EMI", "Months left", "Counted?", "Status", "EMIs paid", "Bounces", "Times 30+ late"]);
    r += 1;
    const loans = tableRows(data, "obligations", "loans");
    const first = r;
    for (const l of loans) {
      put2(ws, r, 1, l.lender ?? null); put2(ws, r, 2, l.type ?? null);
      put2(ws, r, 3, l.sanctioned ?? null, "money"); put2(ws, r, 4, l.outstanding ?? null, "money");
      put2(ws, r, 5, l.emi ?? null, "money"); put2(ws, r, 6, l.monthsLeft ?? null, "number"); put2(ws, r, 7, l.foir ?? "Yes");
      put2(ws, r, 8, l.status ?? "Live"); put2(ws, r, 9, l.paid ?? null, "number"); put2(ws, r, 10, l.bounces ?? null, "number"); put2(ws, r, 11, l.dpd30 ?? null, "number");
      r += 1;
    }
    if (!loans.length) { ws.getCell(r, 1).value = "No running loans given."; r += 1; }
    else {
      put2(ws, r, 1, "Total", "text", true);
      const keyOf: Record<number, string> = { 3: "sanctioned", 4: "outstanding", 5: "emi" };
      for (const col of [3, 4, 5]) {
        const l = colLetter(col);
        put2(ws, r, col, { formula: `SUM(${l}${first}:${l}${r - 1})`, result: sum(loans.map((x) => (typeof x[keyOf[col]!] === "number" ? (x[keyOf[col]!] as number) : null))) } as never, "money", true);
      }
      r += 1;
      r += 1;
      r = pairs(ws, r, [["Bounces in the running loans' track", a.tracks.bounces, "number"], ["Times a running loan was 30+ days late", a.tracks.dpd30, "number"], ["EMIs from co-applicants counted too", a.coApplicants.emi, "money"]]);
    }
  }

  // ── 5. Eligibility (live formulas) ──
  {
    const ws = sheet(wb, "Eligibility", "REPAYMENT CAPACITY AND ELIGIBILITY", `${sub}. Yellow cells are assumptions: change them and everything below recalculates.`, [52, 22, 22, 22]);
    let r = heading(ws, 4, "Inputs", 4);
    const inputRow = (label: string, value: unknown, fmt: Fmt, input: boolean) => {
      put2(ws, r, 1, label).fill = solid(PALE);
      const c = put2(ws, r, 2, value, fmt, true);
      if (input) c.fill = solid(INPUT);
      r += 1;
      return r - 1;
    };
    const rIncome = inputRow("Income considered, per month", a.monthlyIncome, "money", true);
    const rCeil = inputRow(`Repayment ceiling, % of income${a.ceilingIsAssumed ? " (assumed for this loan type)" : ""}`, a.foirCeiling, "percent", true);
    const rEmi = inputRow("Running EMIs counted", a.existingEmi, "money", true);
    const rRate = inputRow(`Rate a year, %${a.rateIsAssumed ? " (assumed for this loan type)" : ""}`, a.rate, "percent", true);
    const rN = inputRow("Tenure, months", a.tenureMonths, "number", true);
    const rAmt = inputRow("Loan asked for", a.requested, "money", true);
    r += 1;
    r = heading(ws, r, "Result", 4);
    const room = Math.max(0, ((a.monthlyIncome ?? 0) * a.foirCeiling) / 100 - a.existingEmi);
    const f = (cell: string) => `B${cell}`;
    const rRoom = r;
    put2(ws, r, 1, "Room for a new EMI").fill = solid(PALE);
    put2(ws, r, 2, { formula: `MAX(0,${f(String(rIncome))}*${f(String(rCeil))}/100-${f(String(rEmi))})`, result: room } as never, "money", true); r += 1;
    const rElig = r;
    put2(ws, r, 1, "Loan the income supports").fill = solid(PALE);
    put2(ws, r, 2, { formula: `IFERROR(PV(B${rRate}/1200,B${rN},-B${rRoom}),0)`, result: loanForEmi(room, a.rate, a.tenureMonths) ?? 0 } as never, "money", true); r += 1;
    const rProp = r;
    put2(ws, r, 1, "EMI on the loan asked for").fill = solid(PALE);
    put2(ws, r, 2, { formula: `IFERROR(PMT(B${rRate}/1200,B${rN},-B${rAmt}),0)`, result: a.proposedEmi ?? 0 } as never, "money", true); r += 1;
    put2(ws, r, 1, "Repayment after the loan, % of income").fill = solid(PALE);
    put2(ws, r, 2, { formula: `IFERROR((B${rEmi}+B${rProp})/B${rIncome}*100,0)`, result: a.foirAfter ?? 0 } as never, "percent", true); r += 1;
    put2(ws, r, 1, "Verdict").fill = solid(PALE);
    put2(ws, r, 2, { formula: `IF(B${rAmt}=0,"Loan amount not given",IF(B${rAmt}<=B${rElig},"Within what the income supports","Above what the income supports"))`, result: !a.requested ? "Loan amount not given" : a.eligible !== null && a.requested <= a.eligible ? "Within what the income supports" : "Above what the income supports" } as never, "text", true);
    r += 2;

    // other ways to take income
    r = heading(ws, r, "Other ways the income can be taken (lenders differ: use the one the lender uses)", 4);
    tableHeader(ws, r, ["Method", "Monthly income", "Loan it supports", "Assumed margin"]);
    r += 1;
    const method = (label: string, income: number | null, margin: number | null) => {
      put2(ws, r, 1, label);
      const m = put2(ws, r, 4, margin, "percent", true);
      if (margin !== null) m.fill = solid(INPUT);
      const incomeCell = margin !== null && income !== null ? { formula: `${income}*D${r}/100`, result: (income * margin) / 100 } : income;
      put2(ws, r, 2, incomeCell as never, "money", true);
      const inc = margin !== null && income !== null ? (income * margin) / 100 : income;
      const res = inc === null ? 0 : loanForEmi(Math.max(0, (inc * a.foirCeiling) / 100 - a.existingEmi), a.rate, a.tenureMonths) ?? 0;
      put2(ws, r, 3, { formula: `IFERROR(PV($B$${rRate}/1200,$B$${rN},-MAX(0,B${r}*$B$${rCeil}/100-$B$${rEmi})),0)`, result: res } as never, "money", true);
      r += 1;
    };
    method("As used above", a.monthlyIncome, null);
    method("Average monthly bank credits × margin", a.banking.avgCredits12, 15);
    method("Average monthly GST sales × industry margin", a.gst.avg, 10);
    ws.mergeCells(r + 1, 1, r + 1, 4);
    ws.getCell(r + 1, 1).value = "The margins here are placeholders: lenders use their own industry margins (usually 5% to 15%). Change the yellow cells to the lender's figure.";
    ws.getCell(r + 1, 1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    ws.getCell(r + 1, 1).alignment = { wrapText: true };
    ws.getRow(r + 1).height = 26;
  }

  // ── 6. Banking ──
  {
    const ws = sheet(wb, "Banking", "BANK STATEMENT ANALYSIS", sub, [26, 16, 16, 18, 16, 16, 14, 14, 14, 16, 14, 14]);
    let r = heading(ws, 4, "Accounts", 6);
    r = sectionPairs(ws, r, sec("banking")!, data);
    r += 1;
    r = heading(ws, r, "Month by month", 6);
    tableHeader(ws, r, ["Month", "Credits", "Debits", "Average balance", "Lowest balance", "Returns"]);
    r += 1;
    const months = tableRows(data, "banking", "months");
    const first = r;
    for (const m of months) {
      put2(ws, r, 1, m.month ?? null); put2(ws, r, 2, m.credits ?? null, "money"); put2(ws, r, 3, m.debits ?? null, "money");
      put2(ws, r, 4, m.avgBalance ?? null, "money"); put2(ws, r, 5, m.minBalance ?? null, "money"); put2(ws, r, 6, m.returns ?? null, "number");
      r += 1;
    }
    if (!months.length) { ws.getCell(r, 1).value = "No monthly figures given."; r += 1; }
    else {
      const last = r - 1;
      const six = Math.min(last, first + 5);
      const stat = (label: string, fn: (col: string) => string, results: (number | null)[]) => {
        put2(ws, r, 1, label, "text", true).fill = solid(PALE);
        [2, 3, 4].forEach((col, i) => put2(ws, r, col, { formula: fn(colLetter(col)), result: results[i] ?? 0 } as never, "money", true));
        r += 1;
      };
      const col = (k: string) => months.map((m) => (typeof m[k] === "number" ? (m[k] as number) : null));
      const av = (xs: (number | null)[]) => { const k = xs.filter((x): x is number => x !== null); return k.length ? k.reduce((p, c) => p + c, 0) / k.length : 0; };
      stat("Average, all months", (c) => `IFERROR(AVERAGE(${c}${first}:${c}${last}),0)`, [av(col("credits")), av(col("debits")), av(col("avgBalance"))]);
      stat("Average, latest 6 months", (c) => `IFERROR(AVERAGE(${c}${first}:${c}${six}),0)`, [av(col("credits").slice(0, 6)), av(col("debits").slice(0, 6)), av(col("avgBalance").slice(0, 6))]);
      put2(ws, r, 1, "Total returns", "text", true).fill = solid(PALE);
      put2(ws, r, 6, { formula: `SUM(F${first}:F${last})`, result: sum(months.map((m) => (typeof m.returns === "number" ? m.returns : 0))) } as never, "number", true);
      r += 2;
    }
    const detail = tableRows(data, "bankingDetail", "detail");
    if (detail.length) {
      r = heading(ws, r, `From the statement, in detail${data.bankingDetail?.bankName ? `: ${data.bankingDetail.bankName}` : ""}`, 12);
      tableHeader(ws, r, ["Month", "Credits (no.)", "Debits (no.)", "Salary / regular credits", "EMIs seen", "Balance 5th", "Balance 10th", "Balance 15th", "Balance 25th", "Average balance", "Inward returns", "Outward returns"]);
      r += 1;
      const f0 = r;
      const n = (v: unknown) => (typeof v === "number" ? v : null);
      for (const m of detail) {
        put2(ws, r, 1, m.month ?? null); put2(ws, r, 2, m.creditCount ?? null, "number"); put2(ws, r, 3, m.debitCount ?? null, "number");
        put2(ws, r, 4, m.salary ?? null, "money"); put2(ws, r, 5, m.emisSeen ?? null, "money");
        put2(ws, r, 6, m.bal5 ?? null, "money"); put2(ws, r, 7, m.bal10 ?? null, "money"); put2(ws, r, 8, m.bal15 ?? null, "money"); put2(ws, r, 9, m.bal25 ?? null, "money");
        const bals = [m.bal5, m.bal10, m.bal15, m.bal25].map(n).filter((x): x is number => x !== null);
        put2(ws, r, 10, { formula: `IFERROR(AVERAGE(F${r}:I${r}),0)`, result: bals.length ? bals.reduce((p, c) => p + c, 0) / bals.length : 0 } as never, "money", true);
        put2(ws, r, 11, m.inward ?? null, "number"); put2(ws, r, 12, m.outward ?? null, "number");
        r += 1;
      }
      const l0 = r - 1;
      put2(ws, r, 1, "Average / total", "text", true).fill = solid(PALE);
      const colSum = (k: string) => detail.reduce((p, c) => p + (typeof c[k] === "number" ? (c[k] as number) : 0), 0);
      put2(ws, r, 2, { formula: `SUM(B${f0}:B${l0})`, result: colSum("creditCount") } as never, "number", true);
      put2(ws, r, 3, { formula: `SUM(C${f0}:C${l0})`, result: colSum("debitCount") } as never, "number", true);
      put2(ws, r, 5, { formula: `IFERROR(AVERAGE(E${f0}:E${l0}),0)`, result: a.bankingDetail.emisSeenAvg ?? 0 } as never, "money", true);
      put2(ws, r, 10, { formula: `IFERROR(AVERAGE(J${f0}:J${l0}),0)`, result: a.bankingDetail.abb ?? 0 } as never, "money", true);
      put2(ws, r, 11, { formula: `SUM(K${f0}:K${l0})`, result: colSum("inward") } as never, "number", true);
      put2(ws, r, 12, { formula: `SUM(L${f0}:L${l0})`, result: colSum("outward") } as never, "number", true);
      r += 1;
      put2(ws, r, 1, "Inward returns, % of debits", "text", true).fill = solid(PALE);
      put2(ws, r, 11, { formula: `IFERROR(K${r - 1}/C${r - 1}*100,0)`, result: a.bankingDetail.inwardPct ?? 0 } as never, "percent", true);
      r += 1;
      put2(ws, r, 1, "Outward returns, % of credits", "text", true).fill = solid(PALE);
      put2(ws, r, 12, { formula: `IFERROR(L${r - 2}/B${r - 2}*100,0)`, result: a.bankingDetail.outwardPct ?? 0 } as never, "percent", true);
      r += 2;
    }
    r = heading(ws, r, "Read-across", 6);
    pairs(ws, r, [
      ["Average balance against the new EMI (times)", a.banking.abbToEmi, "number"],
      ["Cheque / EMI returns", a.banking.returns, "number"],
      ["Bank credits against GST sales (times)", a.gst.creditsToSales, "number"],
      ["Bank credits, latest 6 months against the 6 before, %", a.banking.creditsTrendPct, "percent"],
      ["EMIs seen in the statement a month, against the loans listed", a.bankingDetail.emisSeenAvg === null ? null : `${inr(a.bankingDetail.emisSeenAvg)} against ${inr(a.bankingDetail.declaredEmi)}`],
    ]);
  }

  // ── 7. GST ──
  if (sec("gst") && visible(sec("gst")!.show, data)) {
    const ws = sheet(wb, "GST", "GST TURNOVER ANALYSIS", sub, [22, 22, 22, 22, 20]);
    let r = heading(ws, 4, "Month by month (GSTR-3B)", 5);
    tableHeader(ws, r, ["Month", "Sales", "Purchases", "GST paid in cash", "Sales less purchases"]);
    r += 1;
    const g = tableRows(data, "gst", "months");
    const first = r;
    for (const m of g) {
      put2(ws, r, 1, m.month ?? null); put2(ws, r, 2, m.sales ?? null, "money"); put2(ws, r, 3, m.purchases ?? null, "money"); put2(ws, r, 4, m.taxPaid ?? null, "money");
      put2(ws, r, 5, { formula: `B${r}-C${r}`, result: (typeof m.sales === "number" ? m.sales : 0) - (typeof m.purchases === "number" ? m.purchases : 0) } as never, "money");
      r += 1;
    }
    if (!g.length) { ws.getCell(r, 1).value = "No GST months given."; r += 1; }
    else {
      const last = r - 1;
      put2(ws, r, 1, "Total", "text", true).fill = solid(PALE);
      put2(ws, r, 2, { formula: `SUM(B${first}:B${last})`, result: a.gst.total } as never, "money", true);
      r += 1;
      put2(ws, r, 1, "Average a month", "text", true).fill = solid(PALE);
      put2(ws, r, 2, { formula: `IFERROR(AVERAGE(B${first}:B${last}),0)`, result: a.gst.avg ?? 0 } as never, "money", true);
      r += 2;
    }
    r = heading(ws, r, "Read-across", 5);
    r = pairs(ws, r, [
      ["Trend: latest 6 months against the 6 before, %", a.gst.trendPct, "percent"],
      ["Sales annualised from these months", a.gst.annualised, "money"],
      ["Against turnover declared in the ITR / balance sheet, %", a.gst.varianceVsDeclared, "percent"],
      ["Notes", data.gst?.gstNotes ?? null],
    ]);
  }

  // ── 8. Property ──
  if (sec("property")) {
    const ws = sheet(wb, "Property", "PROPERTY AND LOAN-TO-VALUE", sub, [46, 60]);
    let r = heading(ws, 4, "Property");
    r = sectionPairs(ws, r, sec("property")!, data);
    r += 1;
    r = heading(ws, r, "Loan-to-value");
    const rows = r;
    put2(ws, r, 1, "Value used").fill = solid(PALE); put2(ws, r, 2, a.property.value, "money", true); r += 1;
    put2(ws, r, 1, "Loan asked for").fill = solid(PALE); put2(ws, r, 2, a.requested, "money", true); r += 1;
    put2(ws, r, 1, "Loan as % of property value").fill = solid(PALE);
    put2(ws, r, 2, { formula: `IFERROR(B${rows + 1}/B${rows}*100,0)`, result: a.property.ltv ?? 0 } as never, "percent", true); r += 1;
    r = pairs(ws, r, [
      ["Basis for the value", a.property.basis],
      ["Loan against the cost of the property (agreement value), %", a.property.ltvOnCost, "percent"],
      ["Loan against the market value (valuers), %", a.property.ltvOnMarket, "percent"],
    ]);
    if (sec("valuation")) {
      r += 1;
      r = heading(ws, r, "Valuation, from the lender's valuers");
      sectionPairs(ws, r, sec("valuation")!, data);
    }
  }

  // ── 9. Education ──
  if (sec("education")) {
    const ws = sheet(wb, "Education", "COURSE AND COSTS", sub, [46, 60]);
    let r = heading(ws, 4, "Course");
    r = sectionPairs(ws, r, sec("education")!, data);
    const e = data.education ?? {};
    const n = (k: string) => (typeof e[k] === "number" ? (e[k] as number) : 0);
    const total = n("tuition") + n("living") + n("travel") + n("otherCost");
    r += 1;
    r = heading(ws, r, "Funding");
    pairs(ws, r, [
      ["Total cost of the course", total, "money"],
      ["Less scholarship", n("scholarship"), "money"],
      ["Less family contribution", n("ownContribution"), "money"],
      ["Loan needed to close the gap", Math.max(0, total - n("scholarship") - n("ownContribution")), "money"],
    ]);
  }

  // ── 10. Assets ──
  {
    const ws = sheet(wb, "Assets & net worth", "ASSETS AND NET WORTH", sub, [30, 40, 20]);
    let r = heading(ws, 4, "What the applicant owns", 3);
    tableHeader(ws, r, ["Asset", "Details", "Value today"]);
    r += 1;
    const assets = tableRows(data, "assets", "assets");
    const first = r;
    for (const x of assets) { put2(ws, r, 1, x.type ?? null); put2(ws, r, 2, x.description ?? null); put2(ws, r, 3, x.value ?? null, "money"); r += 1; }
    if (!assets.length) { ws.getCell(r, 1).value = "No assets given."; r += 1; }
    else { put2(ws, r, 1, "Total assets", "text", true); put2(ws, r, 3, { formula: `SUM(C${first}:C${r - 1})`, result: a.netWorth.assets } as never, "money", true); r += 1; }
    r += 1;
    pairs(ws, r, [["Loans and card dues outstanding", a.netWorth.liabilities, "money"], ["Net worth", a.netWorth.net, "money"]], 3);
  }

  // ── 10b. Scorecard ──
  {
    const ws = sheet(wb, "Scorecard", "INDICATIVE SCORECARD", `${sub}. Change nothing here: it works from the other sheets.`, [50, 28, 12, 14, 14]);
    let r = 4;
    const sc = a.scorecard;
    if (!sc.items.length) {
      ws.getCell(r, 1).value = "Not enough answers yet.";
    } else {
      tableHeader(ws, r, ["Test", "This case", "Points", "Lowest possible", "Highest possible"]);
      r += 1;
      const first = r;
      for (const it of sc.items) {
        put2(ws, r, 1, it.name); put2(ws, r, 2, it.value);
        const p = put2(ws, r, 3, it.points, "number", true);
        p.fill = flagFill(it.points < 0 ? "risk" : it.points === 0 ? "watch" : "good");
        put2(ws, r, 4, it.min, "number"); put2(ws, r, 5, it.max, "number");
        r += 1;
      }
      const last = r - 1;
      put2(ws, r, 1, "Total", "text", true).fill = solid(PALE);
      put2(ws, r, 3, { formula: `SUM(C${first}:C${last})`, result: sc.items.reduce((p, c) => p + c.points, 0) } as never, "number", true);
      put2(ws, r, 4, { formula: `SUM(D${first}:D${last})`, result: sc.items.reduce((p, c) => p + c.min, 0) } as never, "number", true);
      put2(ws, r, 5, { formula: `SUM(E${first}:E${last})`, result: sc.items.reduce((p, c) => p + c.max, 0) } as never, "number", true);
      const tot = r; r += 1;
      put2(ws, r, 1, "Score, % of the way from lowest to highest", "text", true).fill = solid(PALE);
      put2(ws, r, 3, { formula: `IFERROR((C${tot}-D${tot})/(E${tot}-D${tot}),0)`, result: (sc.percent ?? 0) / 100 } as never, "number", true).numFmt = "0%";
      const pr = r; r += 1;
      put2(ws, r, 1, "Grade", "text", true).fill = solid(PALE);
      put2(ws, r, 3, { formula: `IF(C${pr}>0.8,"A",IF(C${pr}>0.6,"B",IF(C${pr}>0.5,"C",IF(C${pr}>0.35,"D",IF(C${pr}>0.2,"E","F")))))`, result: sc.grade ?? "" } as never, "text", true);
      r += 2;
    }
    note(ws, r, 5, sc.note, 52);
  }

  // ── 10c. Checks and documents ──
  {
    const ws = sheet(wb, "Checks & documents", "CHECKS, DISCUSSION, DOCUMENTS AND DEVIATIONS", sub, [48, 42, 18, 50]);
    let r = heading(ws, 4, "Credit checks and verification", 4);
    r = sectionPairs(ws, r, sec("checks")!, data);
    r += 1;
    r = heading(ws, r, "Personal discussion and visit", 4);
    r = sectionPairs(ws, r, sec("discussion")!, data);
    r += 1;
    r = heading(ws, r, "Documents", 4);
    r = schemaTable(ws, r, sec("documents"), "list", data, "No documents listed yet.");
    r += 1;
    r = heading(ws, r, "Deviations and what covers each", 4);
    schemaTable(ws, r, sec("remarks"), "deviationList", data, "No deviations noted.");
  }

  // ── 11. Lender match ──
  {
    const ws = sheet(wb, "Lender match", "LENDERS THAT MAY FIT", `${sub}. From the lender rules recorded in the CRM; a person must confirm each one.`, [26, 16, 10, 70, 60]);
    let r = 4;
    if (!b.match || !b.match.length) {
      ws.mergeCells(r, 1, r, 5);
      ws.getCell(r, 1).value = b.matchNote ?? "No lenders to show yet.";
      ws.getCell(r, 1).alignment = { wrapText: true, indent: 1 };
    } else {
      tableHeader(ws, r, ["Lender", "Fit", "Score", "Why", "What to check"]);
      r += 1;
      for (const m of b.match) {
        put2(ws, r, 1, m.lender, "text", true);
        const c = put2(ws, r, 2, m.status.replace("_", " "));
        c.fill = solid(m.status === "STRONG" ? GREEN : m.status === "POSSIBLE" ? AMBER : m.status === "EXCLUDED" ? RED : PALE);
        put2(ws, r, 3, m.score, "number"); put2(ws, r, 4, m.reasons); put2(ws, r, 5, m.checks);
        r += 1;
      }
    }
  }

  // ── 12. Risks & recommendation ──
  {
    const ws = sheet(wb, "Risks & recommendation", "RISKS AND RECOMMENDATION", sub, [46, 80]);
    let r = heading(ws, 4, "Flags raised by the numbers");
    for (const f of a.flags) {
      const c1 = ws.getCell(r, 1); c1.value = f.level === "risk" ? "RISK" : f.level === "watch" ? "WATCH" : "GOOD"; c1.fill = flagFill(f.level); c1.border = border; c1.font = { bold: true };
      const c2 = ws.getCell(r, 2); c2.value = f.text; c2.border = border; c2.alignment = { wrapText: true };
      r += 1;
    }
    if (!a.flags.length) { ws.getCell(r, 1).value = "Nothing flagged yet."; r += 1; }
    r += 1;
    r = heading(ws, r, "Staff assessment");
    sectionPairs(ws, r, sec("remarks")!, data);
  }

  // ── 13. Missing ──
  {
    const ws = sheet(wb, "Missing information", "INFORMATION STILL MISSING", sub, [34, 80]);
    const gaps = missingCore(family, data);
    let r = 4;
    if (!gaps.length) { ws.getCell(r, 1).value = "Every key question has an answer."; }
    else {
      tableHeader(ws, r, ["Section", "Question"]);
      r += 1;
      for (const g of gaps) { put2(ws, r, 1, g.section); put2(ws, r, 2, g.label); r += 1; }
    }
    const pending = tableRows(data, "documents", "list").filter((x) => x.status === "Pending");
    if (pending.length) {
      r += 2;
      r = heading(ws, r, "Documents still pending", 2);
      for (const x of pending) { put2(ws, r, 1, x.document ?? null); put2(ws, r, 2, [x.who, x.remark].filter(Boolean).join(" · ") || null); r += 1; }
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((p, c) => p + (c ?? 0), 0);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
