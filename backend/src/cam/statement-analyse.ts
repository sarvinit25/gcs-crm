import type { Txn } from "./statement-parse";

// What an analyst reads off a bank statement, month by month: how much came in and went out, the balance on four fixed
// dates (their average is the "average bank balance"), the EMIs going out, regular credits like salary, and bounced
// payments. Everything here is read from keywords in the narration, so the answer lists what it found for a person to check.

const MONTH_NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const EMI = /\b(EMI|ECS|NACH|ACH\s?D|ACH[-\s]?DR|LOAN|LN\s?A\/?C|INSTAL+MENT|BAJAJ\s?FIN\w*|CHOLA\w*|HDFC\s?LTD|TATA\s?CAP\w*|MAGMA|MUTHOOT|MAHINDRA\s?FIN\w*|HOME\s?FIN\w*|FINSERV|FULLERTON|IIFL|LIC\s?HFL|PNB\s?HOUSING|CAPITAL\s?FIRST|L&T\s?FIN\w*|CLIX|HERO\s?FIN\w*|AU\s?SMALL|AAVAS|POONAWALLA|KOTAK\s?MAHINDRA\s?PRIME)\b/i;
const SALARY = /\b(SALARY|SAL\s?CR\w*|PAYROLL|WAGES|STIPEND)\b/i;
/** The customer's own payment came back unpaid (an EMI or a cheque they issued). */
const INWARD_RETURN = /(?:\bI\/?W\b|INWARD)[^A-Z]*(?:CHQ|CHEQUE|RET|RTN)|RETURN\s?CHARGES?|CHQ\s?RET\w*\s?CH(?:G|ARGES?)|INSUFF\w*|BOUNCE|DISHONOU?R|UNPAID|(?:ECS|NACH|ACH)[^A-Z]*(?:RET|RTN|RETURN|REJECT)/i;
/** A cheque the customer deposited came back unpaid. */
const OUTWARD_RETURN = /(?:\bO\/?W\b|OUTWARD)[^A-Z]*(?:RET|RTN|RETURN)|CHQ\s?DEP\w*\s?RET\w*|DEPOSIT\w*\s?RETURN/i;

export type MonthRow = {
  key: string;
  label: string;
  creditCount: number;
  debitCount: number;
  credits: number;
  debits: number;
  salary: number;
  emisSeen: number;
  bal5: number | null;
  bal10: number | null;
  bal15: number | null;
  bal25: number | null;
  avgBalance: number | null;
  minBalance: number | null;
  inward: number;
  outward: number;
  /** The statement starts late in this month or ends early in it, so its figures are for part of a month. */
  partial: boolean;
};

export type StatementAnalysis = {
  transactions: number;
  from: string;
  to: string;
  monthsFound: number;
  months: MonthRow[];
  openingBalance: number | null;
  closingBalance: number | null;
  emis: { label: string; amount: number; times: number; total: number }[];
  salary: { times: number; total: number; averagePerMonth: number | null };
  returns: { inward: number; outward: number; lines: string[] };
  warnings: string[];
};

const r0 = (n: number) => Math.round(n);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const signature = (t: string) => t.toUpperCase().replace(/[0-9]+/g, "").replace(/[^A-Z& ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

export function analyseTxns(txnsIn: Txn[]): StatementAnalysis {
  const txns = [...txnsIn].sort((a, b) => a.date.getTime() - b.date.getTime()); // stable: same-day order is kept
  const warnings: string[] = [];
  if (!txns.length) throw new Error("no transactions");

  // the balance carried into the first day: the first balance, wound back by that transaction
  const firstWithBalance = txns.find((t) => t.balance !== null);
  const opening = firstWithBalance && firstWithBalance.balance !== null ? firstWithBalance.balance - firstWithBalance.credit + firstWithBalance.debit : null;

  // group by month
  const byMonth = new Map<string, Txn[]>();
  for (const t of txns) {
    const k = `${t.date.getUTCFullYear()}-${String(t.date.getUTCMonth() + 1).padStart(2, "0")}`;
    (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(t);
  }
  const keys = [...byMonth.keys()].sort();

  // balance at the end of a given day: the last known balance on or before it
  const known = txns.filter((t) => t.balance !== null);
  const balanceOn = (date: Date): number | null => {
    let found: number | null = opening;
    for (const t of known) {
      if (t.date.getTime() <= date.getTime()) found = t.balance; else break;
    }
    return found;
  };

  const emiHits = new Map<string, { label: string; amounts: number[]; total: number }>();
  const salaryHits: number[] = [];
  const returnLines: string[] = [];
  let inwardTotal = 0;
  let outwardTotal = 0;

  const months: MonthRow[] = keys.map((k, idx) => {
    const list = byMonth.get(k)!;
    const [y, m] = k.split("-").map(Number) as [number, number];
    let credits = 0, debits = 0, creditCount = 0, debitCount = 0, salary = 0, emisSeen = 0, inward = 0, outward = 0;
    for (const t of list) {
      if (t.credit > 0) { credits += t.credit; creditCount += 1; }
      if (t.debit > 0) { debits += t.debit; debitCount += 1; }
      const isReturn = INWARD_RETURN.test(t.text) || OUTWARD_RETURN.test(t.text);
      if (t.credit > 0 && SALARY.test(t.text) && !isReturn) { salary += t.credit; salaryHits.push(t.credit); }
      if (t.debit > 0 && EMI.test(t.text) && !isReturn) {
        emisSeen += t.debit;
        const sig = signature(t.text) || "LOAN";
        const hit = emiHits.get(sig) ?? { label: t.text.slice(0, 60), amounts: [], total: 0 };
        hit.amounts.push(t.debit);
        hit.total += t.debit;
        emiHits.set(sig, hit);
      }
      if (OUTWARD_RETURN.test(t.text)) { outward += 1; outwardTotal += 1; if (returnLines.length < 10) returnLines.push(`${iso(t.date)}: ${t.text.slice(0, 70)}`); }
      else if (INWARD_RETURN.test(t.text)) { inward += 1; inwardTotal += 1; if (returnLines.length < 10) returnLines.push(`${iso(t.date)}: ${t.text.slice(0, 70)}`); }
    }
    const at = (day: number) => balanceOn(new Date(Date.UTC(y, m - 1, day)));
    const bal = [at(5), at(10), at(15), at(25)];
    const have = bal.filter((b): b is number => b !== null);
    const balances = list.map((t) => t.balance).filter((b): b is number => b !== null);
    const firstDay = list[0]!.date.getUTCDate();
    const lastDay = list[list.length - 1]!.date.getUTCDate();
    const partial = (idx === 0 && firstDay > 5) || (idx === keys.length - 1 && lastDay < 25);
    return {
      key: k,
      label: `${MONTH_NAME[m - 1]} ${y}`,
      creditCount, debitCount,
      credits: r0(credits), debits: r0(debits),
      salary: r0(salary), emisSeen: r0(emisSeen),
      bal5: bal[0] === null ? null : r0(bal[0]), bal10: bal[1] === null ? null : r0(bal[1]), bal15: bal[2] === null ? null : r0(bal[2]), bal25: bal[3] === null ? null : r0(bal[3]),
      avgBalance: have.length ? r0(have.reduce((a, b) => a + b, 0) / have.length) : null,
      minBalance: balances.length ? r0(Math.min(...balances)) : null,
      inward, outward, partial,
    };
  });

  const emis = [...emiHits.values()]
    .map((h) => ({ label: h.label, amount: r0(h.amounts.sort((a, b) => a - b)[Math.floor(h.amounts.length / 2)]!), times: h.amounts.length, total: r0(h.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  // newest first, at most the 12 the CAM holds
  const newestFirst = [...months].reverse();
  const kept = newestFirst.slice(0, 12);
  if (newestFirst.length > 12) warnings.push(`The statement covers ${newestFirst.length} months; the latest 12 are used.`);
  if (months.length < 6) warnings.push(`Only ${months.length} month${months.length === 1 ? "" : "s"} found. Lenders usually want 6 to 12.`);
  const partials = kept.filter((m) => m.partial).map((m) => m.label);
  if (partials.length) warnings.push(`${partials.join(" and ")} ${partials.length === 1 ? "is" : "are"} only part of a month, so its figures are low.`);
  if (known.length < txns.length * 0.8) warnings.push("Many rows had no balance, so the balances on the 5th, 10th, 15th and 25th may be missing or rough.");
  if (!emis.length) warnings.push("No EMI-like debits were recognised. If the customer pays loans, check the statement by eye.");
  warnings.push("EMIs, salary and returned payments are picked out by words in each entry. Check the lists below before relying on them.");

  return {
    transactions: txns.length,
    from: iso(txns[0]!.date),
    to: iso(txns[txns.length - 1]!.date),
    monthsFound: months.length,
    months: kept,
    openingBalance: opening === null ? null : r0(opening),
    closingBalance: known.length ? r0(known[known.length - 1]!.balance as number) : null,
    emis,
    salary: { times: salaryHits.length, total: r0(salaryHits.reduce((a, b) => a + b, 0)), averagePerMonth: salaryHits.length && months.length ? r0(salaryHits.reduce((a, b) => a + b, 0) / months.length) : null },
    returns: { inward: inwardTotal, outward: outwardTotal, lines: returnLines },
    warnings,
  };
}

/** What goes into the CAM's two bank tables, newest month first: the detailed table and the simple month-by-month one. */
export function camFill(a: StatementAnalysis) {
  return {
    bankingDetail: {
      detail: a.months.map((m) => ({ month: m.label, creditCount: m.creditCount, debitCount: m.debitCount, salary: m.salary || null, emisSeen: m.emisSeen || null, bal5: m.bal5, bal10: m.bal10, bal15: m.bal15, bal25: m.bal25, inward: m.inward, outward: m.outward })),
    },
    banking: {
      months: a.months.map((m) => ({ month: m.label, credits: m.credits, debits: m.debits, avgBalance: m.avgBalance, minBalance: m.minBalance, returns: m.inward + m.outward })),
    },
  };
}
