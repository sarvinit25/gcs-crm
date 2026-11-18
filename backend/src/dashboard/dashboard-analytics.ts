/**
 * The arithmetic behind the Dashboard's module analytics (leads, team, channels). Pure functions over plain rows, so the
 * rules are easy to check and the database code in DashboardService only gathers the rows.
 */
import { monthKey, type MonthSlot } from "../reports/report-aggregate";

export const SEGMENT_KEYS = ["HOT", "WARM", "FOLLOW_UP", "COLD"] as const;
export type SegmentMix = Record<(typeof SEGMENT_KEYS)[number] | "NONE", number>;

/** Words that keep their own capitalisation when a source name is tidied. */
const WORDS: Record<string, string> = { whatsapp: "WhatsApp", ai: "AI", ca: "CA", cibil: "CIBIL", sms: "SMS", utm: "UTM", crm: "CRM", emi: "EMI" };

/** "home-enquiry" -> "Home enquiry", "ca-legal-enquiry" -> "CA legal enquiry"; a blank source reads "Unknown". */
export function sourceLabel(source: string | null | undefined): string {
  const words = (source ?? "").replace(/[-_]+/g, " ").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return "Unknown";
  return words.map((w, i) => WORDS[w] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

export type CountRow = { key: string; label: string; count: number };

/** Sources by number of leads, biggest first. Spellings that differ only by case or dashes are one source; the tail is "Other". */
export function topSources(rows: { source: string | null; count: number }[], max = 8): CountRow[] {
  const merged = new Map<string, CountRow>();
  for (const r of rows) {
    const label = sourceLabel(r.source);
    const key = label.toLowerCase();
    const row = merged.get(key) ?? { key, label, count: 0 };
    row.count += r.count;
    merged.set(key, row);
  }
  const sorted = [...merged.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (sorted.length <= max) return sorted;
  const head = sorted.slice(0, max - 1);
  const other = sorted.slice(max - 1).reduce((n, r) => n + r.count, 0);
  return [...head, { key: "other", label: "Other", count: other }];
}

/** How many open leads are Hot, Warm, Follow-up and Cold now; leads with no priority are counted as NONE. */
export function segmentMix(rows: { segment: string | null; count: number }[]): SegmentMix {
  const mix: SegmentMix = { HOT: 0, WARM: 0, FOLLOW_UP: 0, COLD: 0, NONE: 0 };
  for (const r of rows) {
    const k = (SEGMENT_KEYS as readonly string[]).includes(r.segment ?? "") ? (r.segment as keyof SegmentMix) : "NONE";
    mix[k] += r.count;
  }
  return mix;
}

export type TrendPoint = MonthSlot & { leads: number; converted: number };

/** Leads that came in each month, and how many of those have since been converted, over the given months. */
export function leadTrend(items: { createdAt: Date; status: string }[], slots: MonthSlot[]): TrendPoint[] {
  const points = new Map(slots.map((s) => [s.month, { ...s, leads: 0, converted: 0 }]));
  for (const i of items) {
    const p = points.get(monthKey(i.createdAt));
    if (!p) continue;
    p.leads += 1;
    if (i.status === "CONVERTED") p.converted += 1;
  }
  return slots.map((s) => points.get(s.month)!);
}

export type TeamRow = {
  id: string;
  name: string;
  role: string;
  leads: number;
  converted: number;
  /** Whole percent of this person's leads that were converted. */
  conversionPct: number;
  applications: number;
  followUps: number;
  disbursed: number;
};

/**
 * One row per staff member, best disbursals first (then conversions, then leads). People with no activity in the
 * period are left out, so the table is about who did something, not a roll call.
 */
export function leaderboard(
  people: { id: string; name: string; role: string }[],
  counts: {
    leads: Map<string, number>;
    converted: Map<string, number>;
    applications: Map<string, number>;
    followUps: Map<string, number>;
    disbursed: Map<string, number>;
  },
): TeamRow[] {
  return people
    .map((p) => {
      const leads = counts.leads.get(p.id) ?? 0;
      const converted = counts.converted.get(p.id) ?? 0;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        leads,
        converted,
        conversionPct: leads ? Math.round((converted / leads) * 100) : 0,
        applications: counts.applications.get(p.id) ?? 0,
        followUps: counts.followUps.get(p.id) ?? 0,
        disbursed: counts.disbursed.get(p.id) ?? 0,
      };
    })
    .filter((r) => r.leads || r.applications || r.followUps || r.disbursed)
    .sort((a, b) => b.disbursed - a.disbursed || b.converted - a.converted || b.leads - a.leads || a.name.localeCompare(b.name));
}

/** Adds `amount` to `key` in a running total. */
export function addTo(map: Map<string, number>, key: string | null | undefined, amount: number) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}
