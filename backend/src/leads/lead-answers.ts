// A website form sends its answers as lines of text ("Label: answer") and, for the second form, also as
// structured pairs. Either way they are kept as rows (one per question) so the team can filter and report
// on them, instead of reading them out of the lead's notes.

export type AnswerInput = { key: string; label: string; value: string };

const MAX_ANSWERS = 80;
/** Identity numbers stay in the lead's own protected fields, not in the answers table. */
const SENSITIVE = /(^|-)(pan|aadhaar|aadhar|otp|password|dob)(-|$)|date-of-birth/;

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** Reads "Label: answer" lines out of a form's free text. Headings and sentences without a colon are skipped. */
export function answersFromDetail(detail: string | null | undefined): AnswerInput[] {
  if (!detail) return [];
  const seen = new Map<string, AnswerInput>();
  // Some forms put several answers on one line, joined with " — " or " | ".
  const lines = detail.split("\n").flatMap((l) => l.split(/\s[—|]\s(?=[A-Za-z][^:—|]{1,60}:\s)/));
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("—")) continue;
    const at = line.indexOf(":");
    if (at < 2 || at > 80) continue;
    const label = clean(line.slice(0, at), 80);
    const value = clean(line.slice(at + 1), 500);
    const key = slug(label);
    if (!key || !value || SENSITIVE.test(key)) continue;
    seen.set(key, { key, label, value });
    if (seen.size >= MAX_ANSWERS) break;
  }
  return [...seen.values()];
}

/** Explicit answers from a form win over ones read out of the text; each question is kept once. */
export function mergeAnswers(explicit: AnswerInput[] | undefined, fromText: AnswerInput[]): AnswerInput[] {
  const out = new Map<string, AnswerInput>();
  for (const a of fromText) out.set(a.key, a);
  for (const a of explicit ?? []) {
    // Keyed by the question's wording, the same way the text lines are, so one question is never kept twice.
    const key = slug(a.label || a.key);
    const value = clean(a.value ?? "", 500);
    if (!key || !value || SENSITIVE.test(key)) continue;
    out.set(key, { key, label: clean(a.label || a.key, 80), value });
  }
  return [...out.values()].slice(0, MAX_ANSWERS);
}
