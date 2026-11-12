export type TelephonyStats = {
  totals: { calls: number; answered: number; unanswered: number; answerRate: number; totalSeconds: number; avgSeconds: number; cost: number };
  byDirection: { direction: "inbound" | "outbound"; calls: number; answered: number; seconds: number }[];
  grain: "day" | "month";
  series: { key: string; label: string; calls: number; answered: number }[];
  byOutcome: { cause: string; calls: number }[];
  byHour: { hour: number; calls: number; answered: number }[];
  topNumbers: { number: string; calls: number; answered: number; seconds: number }[];
  from: string;
  to: string;
  /** True when Plivo had more calls than one look can read, so the numbers are for the newest part only. */
  partial: boolean;
};

/** 0 → "0s", 75 → "1m 15s", 4320 → "1h 12m". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

/** 9 → "9 am", 0 → "12 am", 13 → "1 pm". */
export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "am" : "pm"}`;
}

/** Axis text for a daily key ("2026-11-09" → "9") or a monthly one ("2026-11" → "Nov"). */
export function seriesTick(key: string, index: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  if (d === undefined) return index === 0 || m === 1 ? `${month} ${String(y).slice(2)}` : month;
  return index === 0 || d === 1 ? `${d} ${month}` : String(d);
}

// ── Page settings, remembered per browser ──────────────────────────────────

export type SectionKey = "cost" | "direction" | "hours" | "outcomes" | "numbers";

export type Prefs = {
  range: string; // a named period, or "custom"
  from: string;
  to: string;
  direction: "all" | "outbound" | "inbound";
  /** Talk time before a call counts as answered, in seconds. */
  minSeconds: number;
  /** How many numbers the "called most" table lists. */
  top: number;
  /** Working hours shown on the busiest-hours chart (24-hour clock, India time). */
  hourFrom: number;
  hourTo: number;
  currency: string;
  /** Minutes between automatic refreshes; 0 is off. */
  autoMinutes: number;
  show: Record<SectionKey, boolean>;
};

export const SECTION_LABEL: Record<SectionKey, string> = {
  cost: "Plivo cost",
  direction: "Outgoing and incoming",
  hours: "Busiest hours",
  outcomes: "How calls ended",
  numbers: "Numbers called most",
};

export const DEFAULT_PREFS: Prefs = {
  range: "30d",
  from: "",
  to: "",
  direction: "all",
  minSeconds: 1,
  top: 10,
  hourFrom: 8,
  hourTo: 21,
  currency: "",
  autoMinutes: 0,
  show: { cost: true, direction: true, hours: true, outcomes: true, numbers: true },
};

const KEY = "gcs_telecaller_prefs";
const pick = <T,>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return v === undefined || v === null || v === "" || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};
const ymdOk = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** Anything stored or typed is checked here, so a stale or hand-edited value can never break the page. */
export function sanitizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const show = (r.show && typeof r.show === "object" ? r.show : {}) as Record<string, unknown>;
  const hourFrom = int(r.hourFrom, 0, 23, DEFAULT_PREFS.hourFrom);
  const hourTo = int(r.hourTo, 0, 23, DEFAULT_PREFS.hourTo);
  return {
    range: typeof r.range === "string" && /^[a-z0-9_]{1,20}$/.test(r.range) && r.range !== "all" ? r.range : DEFAULT_PREFS.range,
    from: ymdOk(r.from),
    to: ymdOk(r.to),
    direction: pick(r.direction, ["all", "outbound", "inbound"] as const, "all"),
    minSeconds: int(r.minSeconds, 1, 600, 1),
    top: int(r.top, 3, 50, 10),
    hourFrom: Math.min(hourFrom, hourTo),
    hourTo: Math.max(hourFrom, hourTo),
    currency: typeof r.currency === "string" ? r.currency.slice(0, 4) : "",
    autoMinutes: pick(Number(r.autoMinutes), [0, 1, 5, 15] as const, 0),
    show: Object.fromEntries((Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => [k, show[k] !== false])) as Record<SectionKey, boolean>,
  };
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitizePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private window or full storage: the settings just last for this visit */
  }
}

/** A spreadsheet-ready copy of what the page shows. Quotes are doubled so a comma in a value can't shift columns. */
export function buildCsv(d: TelephonyStats): string {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const row = (...v: (string | number)[]) => v.map(cell).join(",");
  return [
    row("Summary"),
    row("Calls", d.totals.calls),
    row("Answered", d.totals.answered),
    row("Not answered", d.totals.unanswered),
    row("Pick-up rate %", d.totals.answerRate),
    row("Talk time (seconds)", d.totals.totalSeconds),
    row("Average answered call (seconds)", d.totals.avgSeconds),
    row("Cost", d.totals.cost),
    "",
    row(d.grain === "day" ? "Day" : "Month", "Calls", "Answered"),
    ...d.series.map((r) => row(r.key, r.calls, r.answered)),
    "",
    row("Number", "Calls", "Answered", "Talk time (seconds)"),
    ...d.topNumbers.map((n) => row(n.number, n.calls, n.answered, n.seconds)),
  ].join("\r\n");
}
