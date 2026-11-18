import { SERIES } from "./charts";

/** What the Dashboard's "Module analytics" endpoint returns (see backend/src/dashboard/dashboard-analytics.ts). */
export type Analytics = {
  leads: {
    sources: { key: string; label: string; count: number }[];
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
