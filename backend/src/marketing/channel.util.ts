/**
 * The marketing channels a lead can be credited to. Digital channels follow the plan the agency
 * proposed (search, social, video, WhatsApp, email, organic); offline ones follow the outdoor and
 * on-ground activities an agency typically runs; the last group is how business already arrives.
 * The list is a setting, so it can grow without a code change.
 */
export const DEFAULT_CHANNELS = [
  // digital
  "Google Search Ads",
  "Google Display",
  "YouTube Ads",
  "Meta Ads (Facebook)",
  "Meta Ads (Instagram)",
  "LinkedIn Ads",
  "Microsoft Ads",
  "Performance Max / Demand Gen",
  "X (Twitter) Ads",
  "SEO / Organic search",
  "Social media (organic)",
  "WhatsApp",
  "Email",
  "Website (direct)",
  // offline
  "Hoardings",
  "Digital displays",
  "TV / Radio / Newspaper",
  "Pole kiosk",
  "Festival activation",
  "Tricycle / Canter van",
  "Society activation",
  "Mall activation",
  "Marketplace activation",
  "Roadshow",
  "Exhibition stall",
  "Conference / networking meet",
  // relationships
  "Referral",
  "Sourcing partner",
  "Walk-in",
  "Cold calling",
  "Existing customer",
];

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/[\s_+-]+/g, " ");

const PAID = /^(cpc|ppc|paid|paid search|paid social|paidsocial|paidsearch|cpm|cpv|display|banner|video|pmax|demand gen|demandgen|ads?|sponsored|remarketing|retargeting)$/;

/**
 * Works out the channel from the tracking tags a landing-page link carries
 * (?utm_source=…&utm_medium=…). Returns null when the tags say nothing we recognise —
 * those leads are shown as "Not tracked" rather than guessed at.
 */
export function channelFromUtm(utmSource?: string | null, utmMedium?: string | null): string | null {
  const source = norm(utmSource);
  const medium = norm(utmMedium);
  if (!source && !medium) return null;
  const paid = PAID.test(medium);
  const has = (...names: string[]) => names.some((n) => source === n || source.startsWith(`${n} `) || source.endsWith(` ${n}`));

  if (has("google", "google ads", "adwords", "gads")) {
    if (/display|banner|gdn/.test(medium)) return "Google Display";
    if (/video|youtube/.test(medium)) return "YouTube Ads";
    if (/pmax|performance max|demand gen|demandgen|discover/.test(medium)) return "Performance Max / Demand Gen";
    if (paid || /search/.test(medium)) return "Google Search Ads";
    if (/organic|seo/.test(medium)) return "SEO / Organic search";
    return null;
  }
  if (has("youtube", "yt")) return paid ? "YouTube Ads" : "Social media (organic)";
  if (has("facebook", "fb", "meta")) return paid ? "Meta Ads (Facebook)" : "Social media (organic)";
  if (has("instagram", "ig")) return paid ? "Meta Ads (Instagram)" : "Social media (organic)";
  if (has("linkedin")) return paid ? "LinkedIn Ads" : "Social media (organic)";
  if (has("bing", "microsoft", "msn", "microsoft ads")) return paid ? "Microsoft Ads" : "SEO / Organic search";
  if (has("twitter", "x")) return paid ? "X (Twitter) Ads" : "Social media (organic)";
  if (has("whatsapp", "wa")) return "WhatsApp";
  if (has("email", "newsletter", "mailchimp") || medium === "email") return "Email";
  if (medium === "organic" || has("organic") || has("seo")) return "SEO / Organic search";
  if (source === "direct" || medium === "none") return "Website (direct)";
  if (has("referral") || medium === "referral") return "Referral";
  return null;
}

/** A tracking tag as stored: trimmed, capped, and nothing but plain text. */
export const cleanTag = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return t || undefined;
};

/** Only the path of a landing page — no query string, which could carry someone's personal details. */
export function cleanLandingPage(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  let path = t;
  try {
    path = /^https?:\/\//i.test(t) ? new URL(t).pathname : t;
  } catch {
    return undefined;
  }
  path = path.split(/[?#]/)[0].replace(/[\u0000-\u001f\u007f\s]/g, "").slice(0, 200);
  return path ? (path.startsWith("/") ? path : `/${path}`) : undefined;
}
