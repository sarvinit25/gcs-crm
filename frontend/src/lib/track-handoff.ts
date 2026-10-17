// Picks up what the public website's "Track Application" page left for this sign-in page. The website and
// the CRM share one origin on the live site, so a short-lived sessionStorage note reaches this page. It is
// read once and deleted at once, and ignored if it is old or meant for the other sign-in.

const KEY = "gcs.track.handoff";
const MAX_AGE_MS = 2 * 60_000;

export type Handoff = { phone: string; code?: string };

export function takeHandoff(kind: "client" | "partner"): Handoff | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const note = JSON.parse(raw) as { kind?: string; phone?: string; code?: string; at?: number };
    if (note.kind !== kind) return null;
    if (typeof note.at !== "number" || Date.now() - note.at > MAX_AGE_MS) return null;
    if (typeof note.phone !== "string" || !/^[6-9]\d{9}$/.test(note.phone)) return null;
    // a client's access code is letters and digits; a partner's GCS ID may carry hyphens (GCS-BSA-001)
    const code = typeof note.code === "string" && /^[A-Z0-9-]{4,24}$/.test(note.code) ? note.code : undefined;
    return { phone: note.phone, ...(code ? { code } : {}) };
  } catch {
    return null;
  }
}
