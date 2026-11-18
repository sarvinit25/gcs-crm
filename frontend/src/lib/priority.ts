import { Flame, PhoneCall, Snowflake, Sun, type LucideIcon } from "lucide-react";
import { SERIES } from "./charts";
import type { LeadSegment } from "./types";

/**
 * The look of each lead priority, defined once so the Leads page, the lead's own page and the Dashboard charts always
 * match: Hot is red with a flame, Warm orange with a sun, Follow-up amber with a phone, Cold blue with a snowflake.
 * The word always sits beside the colour and the symbol, so the meaning never depends on telling colours apart.
 */
export type PriorityLook = {
  label: string;
  /** The chart and accent colour. */
  color: string;
  /** Soft background, ring and readable text colour for a pill. */
  tint: string;
  ring: string;
  text: string;
  icon: LucideIcon;
};

export const PRIORITY_META: Record<LeadSegment, PriorityLook> = {
  HOT: { label: "Hot", color: SERIES[7], tint: "#fef2f2", ring: "#fecaca", text: "#b91c1c", icon: Flame },
  WARM: { label: "Warm", color: SERIES[1], tint: "#fff4ed", ring: "#fed7aa", text: "#c2410c", icon: Sun },
  FOLLOW_UP: { label: "Follow-up", color: SERIES[3], tint: "#fffbeb", ring: "#fde68a", text: "#a16207", icon: PhoneCall },
  COLD: { label: "Cold", color: SERIES[0], tint: "#eff6ff", ring: "#bfdbfe", text: "#1d4ed8", icon: Snowflake },
};
