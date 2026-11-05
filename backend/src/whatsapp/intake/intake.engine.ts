// The questions the WhatsApp assistant asks, and how it checks the answers. No AI in here: this is the same list the
// website's second form asks (generated into intake-guide.ts), the same "only ask if an earlier answer says so" rules,
// and the same way of writing an answer down, so a lead from WhatsApp looks like one from the website.

import { slug as answerKey } from "../../leads/lead-answers";
import { INTAKE_GUIDE, type IntakeField, type IntakeLoan } from "./intake-guide";

/** Answers so far, by the form's own question key. */
export type Answers = Record<string, string>;

export const loanFor = (loanSlug: string | null | undefined): IntakeLoan | null => (loanSlug ? (INTAKE_GUIDE[loanSlug] ?? null) : null);

/** The loans the assistant can talk about: what to show a customer who has not said which one. */
export const loanChoices = () => Object.entries(INTAKE_GUIDE).map(([loanSlug, l]) => ({ slug: loanSlug, title: l.title }));

/** "Other (my reason)" counts as "Other" when deciding which later questions to show. */
const asChoice = (v: string | undefined) => (v && v.startsWith("Other (") ? "Other" : v);

/** What a chosen kind of loan already answers, as part of the answers so far. */
export function withSeeds(loan: IntakeLoan, answers: Answers): Answers {
  const seeds = answers["loanKind"] ? (loan.kindSeeds[answers["loanKind"]] ?? {}) : {};
  return { ...seeds, ...answers };
}

/** Is this question showing, given the answers so far? A question shown only after another is itself only shown if that one is. */
function showing(loan: IntakeLoan, field: IntakeField, answers: Answers, depth = 0): boolean {
  if (!field.showWhen) return true;
  if (depth > 8) return false;
  const controller = loan.fields.find((f) => f.key === field.showWhen!.key);
  if (controller && !showing(loan, controller, answers, depth + 1)) return false;
  return field.showWhen.values.includes(asChoice(answers[field.showWhen.key]) ?? "");
}

const answered = (answers: Answers, key: string) => (answers[key] ?? "").trim() !== "";

/** A follow-up text question to an "Other" choice ("Please say what it is for") is answered by "Other (what it is)". */
function coveredByOther(loan: IntakeLoan, field: IntakeField, answers: Answers) {
  const controller = field.showWhen ? loan.fields.find((f) => f.key === field.showWhen!.key) : undefined;
  return Boolean(controller && field.kind === "text" && (answers[controller.key] ?? "").startsWith("Other ("));
}

/** The questions still to ask, in the form's order, and how many are left in all. */
export function nextQuestions(loanSlug: string, answers: Answers, limit = 2) {
  const loan = loanFor(loanSlug);
  if (!loan) return { fields: [] as IntakeField[], remaining: 0 };
  const all = withSeeds(loan, answers);
  const open = loan.fields.filter((f) => showing(loan, f, all) && !answered(all, f.key) && !coveredByOther(loan, f, all));
  return { fields: open.slice(0, limit), remaining: open.length };
}

const STOP = new Set(["the", "of", "or", "and", "a", "an", "to", "in", "is", "it", "my", "for", "we", "i"]);

const lakh = 100_000;
const crore = 10_000_000;

/** "40 lakh", "1.5 cr", "4000000", "40,00,000" -> a number, or null. */
export function parseMoney(raw: string): number | null {
  const text = raw.toLowerCase().replace(/[₹,\s]|rs\.?|inr/g, "");
  const m = text.match(/^(\d+(?:\.\d+)?)(crore|crores|cr|lakh|lakhs|lac|lacs|l|k|thousand)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const times = !unit ? 1 : /^(crore|crores|cr)$/.test(unit) ? crore : /^(lakh|lakhs|lac|lacs|l)$/.test(unit) ? lakh : 1000;
  const value = Math.round(n * times);
  return Number.isFinite(value) ? value : null;
}

/** Indian digit grouping: 4000000 -> "40,00,000". */
export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export type Checked = { ok: true; value: string } | { ok: false; hint: string };

/** Checks one answer against its question and returns it written the way the website writes it. */
export function checkAnswer(field: IntakeField, raw: string): Checked {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, hint: "The answer is empty." };
  if (field.kind === "amount") {
    const n = parseMoney(text);
    if (n === null) return { ok: false, hint: "Give the amount in rupees as a number, for example 4000000." };
    if (n === 0 && !field.allowZero) return { ok: false, hint: "The amount cannot be zero." };
    if (n > 100 * crore * 10) return { ok: false, hint: "That amount looks too large. Ask the customer to confirm it." };
    return { ok: true, value: rupees(n) };
  }
  if (field.kind === "percent") {
    const n = Number(text.replace(/%/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, hint: "Give a percentage between 0 and 100." };
    return { ok: true, value: `${n}%` };
  }
  if (field.kind === "choice" || field.kind === "multi") {
    const options = field.options ?? [];
    const pick = (t: string) => {
      const low = t.toLowerCase().trim();
      const exact = options.find((o) => o.toLowerCase() === low);
      if (exact) return exact;
      const part = options.filter((o) => o.toLowerCase().startsWith(low) || low.startsWith(o.toLowerCase()));
      if (part.length === 1) return part[0]!;
      // a paraphrase: the option whose words overlap most, if one clearly wins
      const words = (x: string) => new Set(x.toLowerCase().replace(/[^a-z0-9\u0900-\u097f ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));
      const mine = words(t);
      const scored = options
        .filter((o) => o !== "Other")
        .map((o) => {
          const theirs = words(o);
          const shared = [...mine].filter((w) => theirs.has(w)).length;
          return { o, score: shared / Math.max(1, new Set([...mine, ...theirs]).size) };
        })
        .sort((a, b) => b.score - a.score);
      const [best, second] = scored;
      return best && best.score >= 0.5 && (!second || best.score - second.score >= 0.15) ? best.o : null;
    };
    if (field.kind === "multi") {
      const parts = text.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
      const picked = parts.map(pick);
      if (picked.some((p) => !p)) return { ok: false, hint: `Choose from: ${options.join(" | ")}` };
      return { ok: true, value: picked.join(", ") };
    }
    const match = pick(text);
    if (match) return { ok: true, value: match };
    if (options.includes("Other")) return { ok: true, value: `Other (${text.slice(0, 120)})` };
    return { ok: false, hint: `Choose one of: ${options.join(" | ")}` };
  }
  return { ok: true, value: text.slice(0, 300) };
}

/**
 * The question a model meant when it sent an answer under a key that is not one of ours (it sometimes makes one up).
 * Tries, in order: the key as the question's own key or wording, then the one open question whose choices include the
 * answer. Returns null when it cannot tell, so nothing is saved against the wrong question.
 */
export function resolveField(loanSlug: string, answers: Answers, key: string, value: string): IntakeField | null {
  const loan = loanFor(loanSlug);
  if (!loan) return null;
  const direct = loan.fields.find((f) => f.key === key) ?? loan.fields.find((f) => answerKey(f.label) === answerKey(key));
  if (direct) return direct;
  const low = value.trim().toLowerCase();
  const open = nextQuestions(loanSlug, answers, 6).fields;
  const byChoice = open.filter((f) => f.options?.some((o) => o.toLowerCase() === low));
  if (byChoice.length === 1) return byChoice[0]!;
  const byName = open.filter((f) => answerKey(f.label).includes(answerKey(key)) || answerKey(key).includes(answerKey(f.label)));
  return byName.length === 1 ? byName[0]! : null;
}

/** Turns the lead's saved answer rows (keyed by the question's wording) into answers by the form's question key. */
export function answersByKey(loanSlug: string | null | undefined, rows: { key: string; value: string }[]): Answers {
  const loan = loanFor(loanSlug);
  if (!loan) return {};
  const byRow = new Map(rows.map((r) => [r.key, r.value]));
  const out: Answers = {};
  for (const f of loan.fields) {
    const v = byRow.get(answerKey(f.label));
    if (v !== undefined && !(f.key in out)) out[f.key] = v;
  }
  return out;
}

export { answerKey };
