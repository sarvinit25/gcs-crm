/**
 * Turns Plivo call records into the numbers on the Telecaller page. Pure: no network, no database, so it is easy to test.
 * Days are India calendar days, like everywhere else in the CRM.
 */
import { istParts, ymd } from "../common/date.util";

export type CallRecord = {
  direction: "inbound" | "outbound";
  /** The customer's number (the callee on outbound calls, the caller on inbound ones), digits as Plivo sent them. */
  customerNumber: string;
  /** When the call started. */
  at: Date;
  /** Seconds the call was connected for. 0 means nobody picked up. */
  seconds: number;
  /** Plivo's own reason the call ended ("Normal Hangup", "No Answer", "Busy", …). */
  hangupCause: string;
  /** What Plivo billed, in the account's currency. */
  cost: number;
};

export type Grain = "day" | "month";

export type TelephonyStats = {
  totals: {
    calls: number;
    answered: number;
    unanswered: number;
    /** 0–100, whole percent. */
    answerRate: number;
    totalSeconds: number;
    avgSeconds: number;
    cost: number;
  };
  byDirection: { direction: "inbound" | "outbound"; calls: number; answered: number; seconds: number }[];
  grain: Grain;
  series: { key: string; label: string; calls: number; answered: number }[];
  byOutcome: { cause: string; calls: number }[];
  byHour: { hour: number; calls: number; answered: number }[];
  topNumbers: { number: string; calls: number; answered: number; seconds: number }[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

/** A call counts as answered when somebody was connected for at least `min` seconds (1 by default: any connection). */
export const isAnswered = (c: CallRecord, min = 1) => c.seconds >= Math.max(1, min);

const dayKey = (d: Date) => ymd(istParts(d));

/** "2026-11-09" → "09 Nov". */
function dayLabel(key: string) {
  const [, m, d] = key.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Every day (or month) from first to last, so a quiet day shows as a zero instead of vanishing. */
function keysBetween(first: string, last: string, grain: Grain): string[] {
  const keys: string[] = [];
  if (grain === "day") {
    const at = (key: string) => {
      const [y, m, d] = key.split("-").map(Number);
      return Date.UTC(y, m - 1, d);
    };
    for (let t = at(first); t <= at(last); t += DAY_MS) {
      const d = new Date(t);
      keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
    }
    return keys;
  }
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return keys;
}

export type SummaryOptions = {
  /** How many numbers to list under "called most". */
  topNumbers?: number;
  /** Seconds of talk time before a call counts as answered; shorter ones are treated as missed (wrong number, hang-up). */
  minSeconds?: number;
};

export function summarise(calls: CallRecord[], opts: SummaryOptions = {}): TelephonyStats {
  const isAns = (c: CallRecord) => isAnswered(c, opts.minSeconds);
  const answered = calls.filter(isAns);
  const totalSeconds = answered.reduce((s, c) => s + c.seconds, 0);

  const directions = (["outbound", "inbound"] as const).map((direction) => {
    const mine = calls.filter((c) => c.direction === direction);
    return {
      direction,
      calls: mine.length,
      answered: mine.filter(isAns).length,
      seconds: mine.reduce((s, c) => s + c.seconds, 0),
    };
  });

  // A window of up to about two months reads best day by day; anything longer, month by month.
  let grain: Grain = "day";
  let series: TelephonyStats["series"] = [];
  if (calls.length) {
    const days = calls.map((c) => dayKey(c.at)).sort();
    const first = days[0];
    const last = days[days.length - 1];
    const spanDays = (Date.parse(last) - Date.parse(first)) / DAY_MS + 1;
    grain = spanDays > 62 ? "month" : "day";
    const keyOf = (c: CallRecord) => (grain === "day" ? dayKey(c.at) : dayKey(c.at).slice(0, 7));
    const tally = new Map<string, { calls: number; answered: number }>();
    for (const c of calls) {
      const row = tally.get(keyOf(c)) ?? { calls: 0, answered: 0 };
      row.calls++;
      if (isAns(c)) row.answered++;
      tally.set(keyOf(c), row);
    }
    series = keysBetween(grain === "day" ? first : first.slice(0, 7), grain === "day" ? last : last.slice(0, 7), grain).map((key) => ({
      key,
      label: grain === "day" ? dayLabel(key) : monthLabel(key),
      calls: tally.get(key)?.calls ?? 0,
      answered: tally.get(key)?.answered ?? 0,
    }));
  }

  const causes = new Map<string, number>();
  for (const c of calls) {
    const cause = c.hangupCause.trim() || "Unknown";
    causes.set(cause, (causes.get(cause) ?? 0) + 1);
  }

  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, calls: 0, answered: 0 }));
  for (const c of calls) {
    const hour = new Date(c.at.getTime() + 330 * 60_000).getUTCHours();
    hours[hour].calls++;
    if (isAns(c)) hours[hour].answered++;
  }

  const numbers = new Map<string, { calls: number; answered: number; seconds: number }>();
  for (const c of calls) {
    if (!c.customerNumber) continue;
    const row = numbers.get(c.customerNumber) ?? { calls: 0, answered: 0, seconds: 0 };
    row.calls++;
    if (isAns(c)) row.answered++;
    row.seconds += c.seconds;
    numbers.set(c.customerNumber, row);
  }

  return {
    totals: {
      calls: calls.length,
      answered: answered.length,
      unanswered: calls.length - answered.length,
      answerRate: calls.length ? Math.round((answered.length / calls.length) * 100) : 0,
      totalSeconds,
      avgSeconds: answered.length ? Math.round(totalSeconds / answered.length) : 0,
      cost: Math.round(calls.reduce((s, c) => s + c.cost, 0) * 100) / 100,
    },
    byDirection: directions,
    grain,
    series,
    byOutcome: [...causes].map(([cause, n]) => ({ cause, calls: n })).sort((a, b) => b.calls - a.calls),
    byHour: hours,
    topNumbers: [...numbers]
      .map(([number, v]) => ({ number, ...v }))
      .sort((a, b) => b.calls - a.calls || b.seconds - a.seconds)
      .slice(0, opts.topNumbers ?? 10),
  };
}
