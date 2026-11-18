import { SERIES } from "./charts";

/** What the Dashboard's "Module analytics" endpoint returns (see backend/src/dashboard/dashboard-analytics.ts). */
export type Analytics = {
  leads: {
    /** value is the source as stored, to open its leads; none for Unknown and Other. */
    sources: { key: string; label: string; count: number; value?: string }[];
    priority: Record<"HOT" | "WARM" | "FOLLOW_UP" | "COLD" | "NONE", number>;
    unassigned: number;
    overdueFollowUps: number;
    trend: { month: string; label: string; leads: number; converted: number }[];
  };
  team:
    | { id: string; name: string; role: string; leads: number; converted: number; conversionPct: number; applications: number; followUps: number; disbursed: number }[]
    | null;
  channels: {
    website: { received: number; newLeads: number; caLegal: number; byForm: { form: string; count: number }[] };
    whatsapp: { needsHuman: number; unread: number; received: number; sent: number };
    voice: { calls: number; leadsCreated: number; avgSeconds: number };
  } | null;
};

/**
 * Priority reads as heat: Hot is red, Warm orange, Follow-up amber, Cold blue. The words always sit beside the colour,
 * so the meaning never depends on telling the colours apart.
 */
export const PRIORITY_ROWS = [
  { key: "HOT", label: "Hot", color: SERIES[7] },
  { key: "WARM", label: "Warm", color: SERIES[1] },
  { key: "FOLLOW_UP", label: "Follow-up", color: SERIES[3] },
  { key: "COLD", label: "Cold", color: SERIES[0] },
] as const;

/** Open leads with a priority, in Hot-to-Cold order, for a bar chart. */
export function priorityBars(priority: Analytics["leads"]["priority"]) {
  return PRIORITY_ROWS.map((p) => ({ key: p.key, label: p.label, value: priority[p.key], display: String(priority[p.key]), color: p.color }));
}

/** Every open lead, including those with no priority yet. */
export const openLeads = (priority: Analytics["leads"]["priority"]) => priority.HOT + priority.WARM + priority.FOLLOW_UP + priority.COLD + priority.NONE;

/** "contact-form" -> "Contact form"; the website's own names for its forms where we know them. */
const FORM_NAMES: Record<string, string> = {
  "contact-form": "Apply / contact form",
  "ca-legal-enquiry": "CA & Legal enquiry",
  "checklist-download": "Checklist download",
  "partner-enquiry": "Become-a-partner enquiry",
};
export function formName(form: string): string {
  if (FORM_NAMES[form]) return FORM_NAMES[form];
  const words = form.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown form";
}

/**
 * The lead pipeline reads as progress: blue at the start, green once converted, red when lost. One colour per stage is
 * used by the bar, the legend dot and the tile, so they always match. The labels carry the meaning too.
 */
export const STAGE_META = [
  { key: "NEW", label: "New", color: "#0ea5e9" },
  { key: "CONTACTED", label: "Contacted", color: "#6366f1" },
  { key: "QUALIFIED", label: "Qualified", color: "#8b5cf6" },
  { key: "DOCS_PENDING", label: "Docs pending", color: "#f59e0b" },
  { key: "CONVERTED", label: "Converted", color: "#10b981" },
  { key: "LOST", label: "Lost", color: "#f87171" },
] as const;

export type StageShare = { key: string; label: string; color: string; count: number; percent: number; width: number };

/**
 * Each stage's count and its share of all leads. `percent` is whole-number for display; `width` is what the stacked
 * bar draws: the exact share, but never less than 2% for a stage that has any leads, so a small stage stays visible.
 */
export function stageShares(byStatus: Record<string, number | undefined>, total: number): StageShare[] {
  return STAGE_META.map((s) => {
    const count = byStatus[s.key] ?? 0;
    const exact = total > 0 ? (count / total) * 100 : 0;
    return { ...s, count, percent: Math.round(exact), width: count > 0 ? Math.max(exact, 2) : 0 };
  });
}

const GREY = "#94a3b8";

/**
 * Donut slices for "where leads come from": one colour per source in the fixed series order. A source that cannot be
 * opened as a list (Unknown, Other) is grey and plain information, not a button. A slice's key is the stored source.
 */
export function sourceSlices(sources: Analytics["leads"]["sources"]) {
  return sources.map((s, i) => ({
    key: s.value ?? s.key,
    label: s.label,
    value: s.count,
    color: s.value ? SERIES[i % SERIES.length] : GREY,
    selectable: Boolean(s.value),
  }));
}

/** Donut slices for the priority mix, Hot to Cold in heat colours. A slice's key is the segment, to open those leads. */
export function prioritySlices(priority: Analytics["leads"]["priority"]) {
  return PRIORITY_ROWS.map((p) => ({ key: p.key, label: p.label, value: priority[p.key], color: p.color }));
}
