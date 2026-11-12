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
