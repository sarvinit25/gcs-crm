/**
 * Duplicate rules for entries arriving from the public website. The same rules
 * run in the website's own filter (src/lib/lead-dedupe.ts there).
 *
 *  - Same phone number AND a matching name  → the same person.
 *  - The entry with more filled-in fields wins; on a tie the stored one stays,
 *    because staff may already have corrected it.
 *  - Same phone but clearly different names → not a duplicate (a family member,
 *    an agent filing for a client): kept as its own lead and flagged.
 */

export type Entry = {
  name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  loanType?: string | null;
  amount?: number | string | null;
  detail?: string | null;
};

const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "shri", "shree", "smt", "dr", "sri"]);

/** Lower-case words with punctuation, extra spaces and titles removed. */
export function nameTokens(raw: string): string[] {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t));
}

/**
 * Same person? Case, word order and titles do not matter, and a shorter form of
 * a name matches a fuller one ("Rahul" ~ "Rahul Sharma" ~ "Rahul Kumar Sharma").
 */
export function namesMatch(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const pool = new Set(long);
  return short.every((t) => pool.has(t));
}

const filled = (v: unknown) => (typeof v === "number" ? Number.isFinite(v) : String(v ?? "").trim() !== "");

/** How many of the form's fields this entry has filled in (0–7). */
export function entryCount(e: Entry): number {
  return [e.name, e.phone, e.email, e.city, e.loanType, e.amount, e.detail].filter(filled).length;
}

/** Only a strictly fuller entry replaces what is stored. */
export function isFuller(incoming: Entry, stored: Entry): boolean {
  return entryCount(incoming) > entryCount(stored);
}
