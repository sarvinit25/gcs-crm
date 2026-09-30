/**
 * One place for every "what day is it / what period is this" decision.
 *
 * The firm works in Mumbai, so calendar days are India time (IST, UTC+5:30, no
 * daylight saving) no matter where the server runs, and the financial year is
 * the Indian April–March one. Nothing here depends on the current year, so it
 * keeps working unchanged for decades.
 */

const IST_OFFSET_MIN = 330;
const DAY_MS = 86_400_000;

export type DateParts = { year: number; month: number; day: number };

/** Calendar date in India for an instant. */
export function istParts(now: Date = new Date()): DateParts {
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
export const ymd = (p: DateParts) => `${p.year}-${pad(p.month)}-${pad(p.day)}`;

/** Today's date in India as YYYY-MM-DD. */
export const istToday = (now: Date = new Date()) => ymd(istParts(now));

/** The UTC instant at which a given India calendar day begins. */
export function istDayStart(p: DateParts): Date {
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - IST_OFFSET_MIN * 60_000);
}

/** The last millisecond of a given India calendar day. */
export const istDayEnd = (p: DateParts) => new Date(istDayStart(p).getTime() + DAY_MS - 1);

/** Parses "YYYY-MM-DD" (an India calendar day). Returns null for anything else. */
export function parseYmd(value: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const p = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const check = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return check.getUTCMonth() === p.month - 1 ? p : null;
}

const addDays = (p: DateParts, days: number): DateParts =>
  istParts(new Date(istDayStart(p).getTime() + days * DAY_MS));

// ── Financial year (1 April – 31 March) ───────────────────────────────────

/** The starting calendar year of the financial year containing a date. */
export const fyStartYear = (p: DateParts) => (p.month >= 4 ? p.year : p.year - 1);

/** "2026-27" */
export const fyLabel = (startYear: number) => `${startYear}-${pad((startYear + 1) % 100)}`;

const fyBounds = (startYear: number) => ({
  from: istDayStart({ year: startYear, month: 4, day: 1 }),
  to: istDayEnd({ year: startYear + 1, month: 3, day: 31 }),
});

// ── Named periods ─────────────────────────────────────────────────────────

export const PERIODS = [
  "all",
  "today",
  "yesterday",
  "7d",
  "30d",
  "month",
  "last_month",
  "quarter",
  "fy",
  "last_fy",
  "year",
] as const;
export type Period = (typeof PERIODS)[number];

export type Range = { from?: Date; to?: Date };

/** Resolves a named period to concrete instants, relative to `now`. */
export function periodRange(period: Period, now: Date = new Date()): Range {
  const t = istParts(now);
  switch (period) {
    case "today":
      return { from: istDayStart(t), to: istDayEnd(t) };
    case "yesterday": {
      const y = addDays(t, -1);
      return { from: istDayStart(y), to: istDayEnd(y) };
    }
    case "7d":
      return { from: istDayStart(addDays(t, -6)), to: istDayEnd(t) };
    case "30d":
      return { from: istDayStart(addDays(t, -29)), to: istDayEnd(t) };
    case "month":
      return {
        from: istDayStart({ ...t, day: 1 }),
        to: istDayEnd({ year: t.year, month: t.month, day: daysInMonth(t.year, t.month) }),
      };
    case "last_month": {
      const prev = t.month === 1 ? { year: t.year - 1, month: 12 } : { year: t.year, month: t.month - 1 };
      return {
        from: istDayStart({ ...prev, day: 1 }),
        to: istDayEnd({ ...prev, day: daysInMonth(prev.year, prev.month) }),
      };
    }
    case "quarter": {
      // Financial quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar.
      const fyMonthIndex = (t.month + 8) % 12; // Apr=0 … Mar=11
      const qStartIdx = Math.floor(fyMonthIndex / 3) * 3;
      const startMonth = ((qStartIdx + 3) % 12) + 1; // back to calendar month 1–12
      const startYear = startMonth > t.month ? t.year - 1 : t.year;
      const endMonth = ((startMonth + 1) % 12) + 1;
      const endYear = endMonth < startMonth ? startYear + 1 : startYear;
      return {
        from: istDayStart({ year: startYear, month: startMonth, day: 1 }),
        to: istDayEnd({ year: endYear, month: endMonth, day: daysInMonth(endYear, endMonth) }),
      };
    }
    case "fy":
      return fyBounds(fyStartYear(t));
    case "last_fy":
      return fyBounds(fyStartYear(t) - 1);
    case "year":
      return {
        from: istDayStart({ year: t.year, month: 1, day: 1 }),
        to: istDayEnd({ year: t.year, month: 12, day: 31 }),
      };
    default:
      return {};
  }
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Human labels for the period picker — the financial-year names move with the calendar. */
export function periodOptions(now: Date = new Date()): { value: Period; label: string }[] {
  const fy = fyStartYear(istParts(now));
  return [
    { value: "all", label: "All time" },
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "month", label: "This month" },
    { value: "last_month", label: "Last month" },
    { value: "quarter", label: "This quarter" },
    { value: "fy", label: `This financial year (${fyLabel(fy)})` },
    { value: "last_fy", label: `Last financial year (${fyLabel(fy - 1)})` },
    { value: "year", label: `Calendar year ${istParts(now).year}` },
  ];
}

export type RangeInput = { range?: string; from?: string; to?: string };

/**
 * The one way every list, report and dashboard turns a request into a date
 * window: a named period, or a custom from/to. Date-only inputs are India
 * calendar days and the end day is included in full.
 */
export function resolveRange(input: RangeInput, now: Date = new Date()): Range {
  if (input.range && (PERIODS as readonly string[]).includes(input.range)) {
    return periodRange(input.range as Period, now);
  }
  const bound = (value: string | undefined, end: boolean): Date | undefined => {
    if (!value) return undefined;
    const p = parseYmd(value);
    if (p) return end ? istDayEnd(p) : istDayStart(p);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  return { from: bound(input.from, false), to: bound(input.to, true) };
}

/** Prisma-ready filter for a date column, or undefined when unbounded. */
export function rangeFilter(range: Range): { gte?: Date; lte?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  return { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) };
}

/** Text for a report header, e.g. "01 Apr 2026 to 31 Mar 2027". */
export function describeRange(range: Range, period?: string): string {
  if (!range.from && !range.to) return "All time";
  const fmt = (d?: Date) =>
    d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "…";
  const span = `${fmt(range.from)} to ${fmt(range.to)}`;
  const label = periodOptions().find((o) => o.value === period)?.label;
  return label && period !== "all" ? `${label} · ${span}` : span;
}
