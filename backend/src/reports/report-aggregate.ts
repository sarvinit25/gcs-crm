/**
 * The arithmetic behind the Reports hub and the detailed reports: months, stages, loan-type shares.
 * Pure functions over plain items, so they are easy to test and identical wherever they are used.
 * Months are India calendar months (the firm works in Mumbai), never the server's.
 */
import { istDayEnd, istDayStart, istParts, type Range } from "../common/date.util";

/** One record as the aggregates see it. */
export type Item = {
  /** The date this record counts on (created, sanctioned, disbursed…). */
  at: Date;
  /** A stage key; the report's definition says which keys exist and how they read. */
  stage: string;
  loanType: string;
  amount: number;
  /** Commission only: what has actually been received. */
  received?: number;
  /** A second tag a tile can count on (a payout's FULL / PART). */
  tag?: string;
};

export type Tile = { label: string; value: number; kind: "count" | "amount" };
export type StageDef = { key: string; label: string };
export type StageRow = { key: string; label: string; count: number; amount: number };
export type MonthSlot = { month: string; label: string };
export type MonthPoint = MonthSlot & { count: number; amount: number };
export type LoanTypeRow = { name: string; count: number; amount: number; percent: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11": the India calendar month an instant falls in. */
export function monthKey(d: Date): string {
  const p = istParts(d);
  return `${p.year}-${pad(p.month)}`;
}

const slot = (year: number, month: number): MonthSlot => ({ month: `${year}-${pad(month)}`, label: `${MONTHS[month - 1]} ${year}` });

/** The last `count` months ending with the month `now` falls in, oldest first. */
export function lastMonths(count: number, now: Date = new Date()): MonthSlot[] {
  const p = istParts(now);
  const out: MonthSlot[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = p.year * 12 + (p.month - 1) - i;
    out.push(slot(Math.floor(index / 12), (index % 12) + 1));
  }
  return out;
}

/**
 * Every month a date window touches, oldest first. An open-ended window runs back `fallback` months from now,
 * and a very long one keeps only the latest `cap` months so the chart stays readable.
 */
export function monthsInRange(range: Range, now: Date = new Date(), fallback = 12, cap = 36): MonthSlot[] {
  const end = range.to && range.to < now ? range.to : now;
  const endP = istParts(end);
  const endIndex = endP.year * 12 + (endP.month - 1);
  let startIndex: number;
  if (range.from) {
    const sp = istParts(range.from);
    startIndex = sp.year * 12 + (sp.month - 1);
  } else {
    startIndex = endIndex - (fallback - 1);
  }
  startIndex = Math.max(startIndex, endIndex - (cap - 1));
  if (startIndex > endIndex) startIndex = endIndex;
  const out: MonthSlot[] = [];
  for (let i = startIndex; i <= endIndex; i++) out.push(slot(Math.floor(i / 12), (i % 12) + 1));
  return out;
}

/** The instants that bound the months in a list: from the first day of the first to the last moment of the last. */
export function monthSpan(slots: MonthSlot[]): Range {
  const [fy, fm] = slots[0].month.split("-").map(Number);
  const [ly, lm] = slots[slots.length - 1].month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
  return { from: istDayStart({ year: fy, month: fm, day: 1 }), to: istDayEnd({ year: ly, month: lm, day: lastDay }) };
}

/** Counts and sums per month for the given slots; items outside them are ignored. */
export function bucketMonths(items: { at: Date; amount?: number }[], slots: MonthSlot[]): MonthPoint[] {
  const points = new Map(slots.map((s) => [s.month, { ...s, count: 0, amount: 0 }]));
  for (const item of items) {
    const point = points.get(monthKey(item.at));
    if (point) {
      point.count += 1;
      point.amount += item.amount ?? 0;
    }
  }
  return slots.map((s) => points.get(s.month)!);
}

const titleCase = (key: string) => {
  const t = key.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Count and amount per stage, in the report's own order; a stage seen in the data but not defined is added at the end. */
export function stageBreakdown(items: Item[], defs: StageDef[]): StageRow[] {
  const rows = new Map<string, StageRow>(defs.map((d) => [d.key, { ...d, count: 0, amount: 0 }]));
  for (const item of items) {
    const row = rows.get(item.stage) ?? { key: item.stage, label: titleCase(item.stage), count: 0, amount: 0 };
    row.count += 1;
    row.amount += item.amount;
    rows.set(item.stage, row);
  }
  return [...rows.values()];
}

/** Loan types by number of records, biggest first, with each one's share of the total. */
export function loanTypeBreakdown(items: Item[]): LoanTypeRow[] {
  const byType = new Map<string, LoanTypeRow>();
  for (const item of items) {
    const row = byType.get(item.loanType) ?? { name: item.loanType, count: 0, amount: 0, percent: 0 };
    row.count += 1;
    row.amount += item.amount;
    byType.set(item.loanType, row);
  }
  const total = items.length;
  return [...byType.values()]
    .map((r) => ({ ...r, percent: total ? Math.round((r.count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count || b.amount - a.amount || a.name.localeCompare(b.name));
}

/** Due / claimed / received, the three buckets of the commission donut. */
export function commissionBuckets(items: { stage: string; amount: number; received?: number }[]) {
  let due = 0;
  let claimed = 0;
  let received = 0;
  for (const c of items) {
    const got = c.stage === "PAID" ? (c.received ?? c.amount) : (c.received ?? 0);
    received += got;
    if (c.stage === "PENDING") due += c.amount;
    // Claimed from the lender and not yet paid: all of a claim, or what is still owed on a part-paid one.
    else if (c.stage === "CLAIMED") claimed += c.amount - got;
    else if (c.stage === "PARTIAL") claimed += Math.max(c.amount - got, 0);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { due: round(due), claimed: round(claimed), received: round(received), total: round(due + claimed + received) };
}

/** True when an instant is in the same India month as `now`. */
export const inMonthOf = (d: Date, now: Date = new Date()) => monthKey(d) === monthKey(now);

/** The first instant of the India month `now` falls in, and the last — for "this month" filters. */
export function currentMonthRange(now: Date = new Date()): Range {
  return monthSpan([lastMonths(1, now)[0]]);
}
