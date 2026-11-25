// Words that point back at something said earlier ("same", "same as above", "wahi") are not an answer. The customer meant the
// earlier value, so that is what the lead must hold, never the word "same". All in code: no AI is involved.

import { answerKey, loanFor, type Answers } from "./intake.engine";
import type { IntakeField } from "./intake-guide";

const SAME = new Set(["same", "ditto", "yahi", "yahin", "wahi", "wahin", "vahi", "vahin", "usi", "isi", "waisa", "aisa", "वही", "यही", "वहीं", "यहीं", "उसी", "इसी", "तोच", "तीच", "हाच", "तेच", "त्याच", "याच"]);
const FILLER = new Set(["yes", "yeah", "yep", "haan", "ha", "ji", "the", "as", "above", "before", "earlier", "previous", "previously", "last", "that", "city", "my", "home", "work", "office", "first", "one", "place", "location", "area", "only", "here", "there", "address", "mentioned", "given", "said", "like", "hi", "hai", "bhi", "se", "ka", "ki", "ke", "pe", "par", "wala", "wali", "ok", "okay"]);

const words = (text: string) => text.toLowerCase().replace(/[.,!?;:"'()\-–—]+/g, " ").split(/\s+/).filter(Boolean);

/** Is this reply only a pointer to an earlier answer: "same", "same as above", "same city", "as before", "wahi"? "The same bank" is not: it names something. */
export function isReference(text: string | null | undefined): boolean {
  const t = words(String(text ?? ""));
  if (!t.length || t.length > 6) return false;
  const pointsBack = t.some((w) => SAME.has(w)) || (t[0] === "as" && t.length <= 3);
  return pointsBack && t.every((w) => SAME.has(w) || FILLER.has(w));
}

const LOCATION_KEYS = new Set(["location", "propertyArea", "projectArea", "otherPropertyLocation"]);

/** A free-text question that asks for a place: a locality, a city, where the property or the project is. */
export function isLocationField(field: IntakeField): boolean {
  if (field.kind !== "text") return false;
  return LOCATION_KEYS.has(field.key) || /\b(location|locality|area|city|address|where is)\b/i.test(field.label);
}

const EMPTY = /^(not sure|not given)/i;

/**
 * The place the customer gave before this question: the latest answer to another place question, else the lead's own city.
 * Rows are the lead's saved answers, oldest first (as saved), keyed by the question's wording.
 */
export function earlierLocation(loanSlug: string | null | undefined, rows: { key: string; value: string }[], currentKey: string, leadCity: string | null | undefined): string | null {
  const loan = loanFor(loanSlug);
  if (loan) {
    const places = new Map(loan.fields.filter((f) => isLocationField(f) && f.key !== currentKey).map((f) => [answerKey(f.label), f.key]));
    for (const row of [...rows].reverse()) {
      const v = (row.value ?? "").trim();
      if (places.has(row.key) && v && !EMPTY.test(v) && !isReference(v)) return v;
    }
  }
  const city = (leadCity ?? "").trim();
  return city && !isReference(city) ? city : null;
}

/** What a typed reply means for a free-text question: the earlier place if they pointed back at one, else their own words, else nothing usable. */
export function resolveReply(field: IntakeField, said: string, rows: { key: string; value: string }[], loanSlug: string | null | undefined, leadCity: string | null | undefined): { value: string } | { value: null; pointedBack: boolean } {
  if (!isReference(said)) return { value: said };
  const place = isLocationField(field) ? earlierLocation(loanSlug, rows, field.key, leadCity) : null;
  return place ? { value: place } : { value: null, pointedBack: true };
}

export type { Answers };
