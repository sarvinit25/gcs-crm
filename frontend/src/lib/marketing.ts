export type MarketingRow = {
  key: string;
  channel: string | null;
  campaign: string | null;
  leads: number;
  qualified: number;
  lost: number;
  applications: number;
  sanctioned: number;
  disbursed: number;
  disbursedAmount: number;
  commission: number;
  spend: number;
  costPerLead: number | null;
  costPerQualified: number | null;
  costPerApplication: number | null;
  costPerDisbursal: number | null;
  qualifiedRate: number | null;
  applicationRate: number | null;
  disbursalRate: number | null;
  returnOnSpend: number | null;
};

export type Funnel = { stage: string; count: number; ofLeads: number | null; ofPrevious: number | null }[];

export type Performance = {
  by: "channel" | "campaign" | "landing" | "month";
  period: string;
  rows: MarketingRow[];
  total: MarketingRow;
  funnel: Funnel;
  spendTracked: boolean;
};

export type SpendEntry = {
  id: string;
  spentOn: string;
  channel: string;
  campaign: string | null;
  vendor: string | null;
  amount: string;
  note: string | null;
  createdBy: { name: string } | null;
};

/**
 * Ready-made tracking tags per channel. Each pair is one the CRM recognises, so a lead that arrives
 * through the link is credited to that channel automatically (the same table is checked on the server).
 */
export const TRACKING_PRESETS: { channel: string; source: string; medium: string }[] = [
  { channel: "Google Search Ads", source: "google", medium: "cpc" },
  { channel: "Google Display", source: "google", medium: "display" },
  { channel: "YouTube Ads", source: "youtube", medium: "video" },
  { channel: "Meta Ads (Facebook)", source: "facebook", medium: "paid_social" },
  { channel: "Meta Ads (Instagram)", source: "instagram", medium: "paid_social" },
  { channel: "LinkedIn Ads", source: "linkedin", medium: "paid_social" },
  { channel: "Microsoft Ads", source: "bing", medium: "cpc" },
  { channel: "WhatsApp", source: "whatsapp", medium: "share" },
  { channel: "Email", source: "newsletter", medium: "email" },
];

const slug = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A landing-page link carrying the tracking tags — what the advertising agency pastes into each ad. */
export function buildTrackingLink(base: string, preset: { source: string; medium: string }, campaign: string, content?: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(base.trim()) ? base.trim() : `https://${base.trim()}`);
  } catch {
    return null;
  }
  if (!url.hostname.includes(".")) return null;
  url.searchParams.set("utm_source", preset.source);
  url.searchParams.set("utm_medium", preset.medium);
  const c = slug(campaign);
  if (c) url.searchParams.set("utm_campaign", c);
  const k = slug(content ?? "");
  if (k) url.searchParams.set("utm_content", k);
  return url.toString();
}

export const rupees = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `₹${formatIndian(Math.round(n))}`);
export const percent = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

function formatIndian(n: number) {
  const s = String(Math.abs(n));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}${rest ? `${rest},` : ""}${last3}`;
}

/** "2026-10" → "Oct 2026" without relying on the browser's locale. */
export const monthLabel = (key: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1]} ${m[1]}`;
};
