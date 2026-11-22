// The questions the WhatsApp assistant asks, and how it checks the answers. No AI in here: this is the same list the
// website's second form asks (generated into intake-guide.ts), the same "only ask if an earlier answer says so" rules,
// and the same way of writing an answer down, so a lead from WhatsApp looks like one from the website.

import { slug as answerKey } from "../../leads/lead-answers";
import { INTAKE_GUIDE, type IntakeField, type IntakeLoan } from "./intake-guide";

/** Answers so far, by the form's own question key. */
export type Answers = Record<string, string>;

export const loanFor = (loanSlug: string | null | undefined): IntakeLoan | null => (loanSlug ? (INTAKE_GUIDE[loanSlug] ?? null) : null);

/** The loans grouped as the website groups them (Property Finance, Business Growth ...), so every one of the 28 can be picked by tap. */
export function loanGroups(): { name: string; loans: { slug: string; title: string }[] }[] {
  const groups: { name: string; loans: { slug: string; title: string }[] }[] = [];
  for (const [slug, l] of Object.entries(INTAKE_GUIDE)) {
    let g = groups.find((x) => x.name === l.group);
    if (!g) groups.push((g = { name: l.group, loans: [] }));
    g.loans.push({ slug, title: l.title });
  }
  return groups;
}

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

/**
 * A choice answered with just "Other" says nothing yet: the first such question that is showing, so the assistant can ask
 * what it is ("Other" on a property type is not enough for a lender).
 */
export function otherToSpecify(loanSlug: string, answers: Answers): IntakeField | null {
  const loan = loanFor(loanSlug);
  if (!loan) return null;
  const all = withSeeds(loan, answers);
  return loan.fields.find((f) => f.kind === "choice" && f.options?.includes("Other") && all[f.key] === "Other" && showing(loan, f, all)) ?? null;
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

/** An amount inside a sentence ("about 1.5 lakh a month"): used only when the sentence holds exactly one figure. */
function looseMoney(raw: string): number | null {
  const found = [...raw.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(crore|crores|cr|lakh|lakhs|lac|lacs|l|k|thousand)?(?![a-z])/gi)];
  if (found.length !== 1) return null;
  return parseMoney(`${found[0]![1]}${found[0]![2] ?? ""}`);
}

/** Does the customer's own message carry a figure (digits, or a number word in English, Hindi or Marathi)? The AI must never turn "Rent" into 0. */
export function hasFigure(text: string): boolean {
  return /[\d०-९]/.test(text) || /\b(zero|nil|none|nothing|no|not any|nahi|nahin|nahi hai|ek|do|teen|char|paanch|panch|chhe|saat|aath|nau|das|sau|hazaar|hajar|lakh|lac|crore|karod|thousand|hundred|million)\b|शून्य|नहीं|नही|नाही|एक|दो|तीन|चार|पाच|पांच|दस|सौ|हज़ार|हजार|लाख|करोड/i.test(text);
}

/** Indian digit grouping: 4000000 -> "40,00,000". */
export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export type Checked = { ok: true; value: string } | { ok: false; hint: string };

/** Checks one answer against its question and returns it written the way the website writes it. */
export function checkAnswer(field: IntakeField, raw: string): Checked {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, hint: "The answer is empty." };
  if (field.kind === "amount") {
    const n = parseMoney(text) ?? looseMoney(text);
    if (n === null) return { ok: false, hint: "Give the amount in rupees as a number, for example 4000000." };
    if (n === 0 && !field.allowZero) return { ok: false, hint: "The amount cannot be zero." };
    // a bare "1" or "50" is almost never a rupee amount: it is usually lakh or crore without the unit
    if (n > 0 && n < 1000) return { ok: false, hint: "That looks too small to be an amount in rupees. Ask whether they meant lakh or crore, and ask them to write it with the unit, for example 1 crore or 25 lakh." };
    if (n > 100 * crore * 10) return { ok: false, hint: "That amount looks too large. Ask the customer to confirm it." };
    return { ok: true, value: rupees(n) };
  }
  if (field.kind === "percent") {
    // "11 percent floating" or "around 11%" carry one number: take it; two numbers ("9 to 10") are not an answer
    const found = text.match(/\d+(?:\.\d+)?/g) ?? [];
    const n = found.length === 1 ? Number(found[0]) : NaN;
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
  return null;
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

const SELF_EMPLOYED_WORDS = ["self-employed", "self employed", "proprietor", "partner", "director", "professional", "partnership", "pvt ltd co"];

/**
 * What the lead's own fields should say, worked out from the answers, the same way the website's second form does it:
 * salaried or self-employed, and the monthly take-home salary. Staff-entered values are never touched by the caller.
 */
export function leadFacts(loanSlug: string | null | undefined, answers: Answers, applicant: string | null): { employmentType: "SALARIED" | "SELF_EMPLOYED" | null; monthlyIncome: number | null } {
  const who = (answers["applicantType"] ?? answers["applicantCategory"] ?? applicant ?? "").trim().toLowerCase();
  const employmentType = who === "salaried" ? "SALARIED" : SELF_EMPLOYED_WORDS.includes(who) ? "SELF_EMPLOYED" : null;
  const salary = answers["netSalary"] ? parseMoney(answers["netSalary"]) : null;
  return { employmentType, monthlyIncome: salary && salary > 0 ? salary : null };
}

/**
 * Things that mean an expert must look at the file before anything is said to the customer. Never a reason to turn a
 * customer away: a bounce, an overdue, an unusual owner or a title question is a conversation, not a rejection.
 */
export function reviewReasons(loanSlug: string | null | undefined, answers: Answers): string[] {
  const loan = loanFor(loanSlug);
  if (!loan) return [];
  const out: string[] = [];
  const say = (reason: string) => { if (!out.includes(reason)) out.push(reason); };
  if (loanSlug === "private-funding") say("Private funding always needs an expert's review");
  for (const f of loan.fields) {
    const v = (answers[f.key] ?? "").trim();
    if (!v || /^Not (sure|given)/.test(v)) continue;
    if (/how regular has the repayment been/i.test(f.label)) {
      if (/overdue now/i.test(v)) say("Something is overdue on the present loan");
      else if (/delays or bounces/i.test(v)) say("Delays or bounces on the present loan");
    } else if (/is any amount overdue/i.test(f.label) && v === "Yes") say("An amount is overdue on the present facility");
    else if (/cheque returns or missed instalments/i.test(f.label) && /more often/i.test(v)) say("Cheque returns or missed instalments, more than once or twice");
    else if (/late or missed emi or card payments/i.test(f.label) && /more often/i.test(v)) say("Late or missed payments in the last year, more than once or twice");
    else if (/anything on your credit report/i.test(f.label) && /write-off|settlement|overdue|cheque bounce/i.test(v)) say(`Credit report concern: ${v}`);
    else if (/declined before/i.test(f.label) && v === "Yes") say("A similar application was declined before");
    else if (/whose name is the property in/i.test(f.label) && v !== "My own name") say("The property is not in the applicant's own name");
    else if (/is the title clear/i.test(f.label) && !/^Yes/.test(v)) say("Property title is not confirmed clear");
  }
  return out;
}

const CHECKLIST_OF: Record<string, string> = { Salaried: "home-loan-salaried", NRI: "home-loan-nri" };

/** The website's document checklist (a PDF) for a loan. Home loans have one each for salaried, self-employed and NRI. */
export function checklistUrl(site: string, loanSlug: string | null | undefined, applicant: string | null, loanKind?: string | null): string | null {
  if (!loanSlug || !loanFor(loanSlug)) return null;
  let file = loanSlug;
  // Loan Consolidation is a kind of personal loan with a checklist of its own.
  if (loanSlug === "personal-loan" && /consolidation/i.test(loanKind ?? "")) file = "loan-consolidation";
  if (loanSlug === "home-loan") file = CHECKLIST_OF[applicant ?? ""] ?? (applicant && SELF_EMPLOYED_WORDS.includes(applicant.toLowerCase()) ? "home-loan-self-employed" : "home-loan");
  return `${site.replace(/\/+$/, "")}/checklists/${file}-checklist.pdf`;
}

/** The parts of every form that ask about the person, not the product: these answers carry over to a second loan. */
const PROFILE_SECTIONS = ["Your work and income", "Your existing loans and credit", "More about your finances"];

/**
 * What a customer already told us that still holds for another loan: only questions about the person (work, income, running
 * loans, credit, other property), and only where the other loan's form asks the very same question.
 */
export function sharedAnswers(fromSlug: string | null | undefined, toSlug: string, answers: Answers): { label: string; value: string }[] {
  const from = loanFor(fromSlug);
  const to = loanFor(toSlug);
  if (!from || !to) return [];
  const out: { label: string; value: string }[] = [];
  for (const f of from.fields) {
    if (!f.section || !PROFILE_SECTIONS.includes(f.section)) continue;
    const v = (answers[f.key] ?? "").trim();
    if (!v || /^Not (sure|given)/.test(v)) continue;
    if (to.fields.some((t) => t.key === f.key && t.label === f.label && t.section === f.section)) out.push({ label: f.label, value: v });
  }
  return out;
}

/** Lower case, with punctuation and spacing flattened, so words quoted from a message can be found in it. */
const flat = (t: string) => t.toLowerCase().replace(/[\s"'\u201c\u201d\u2018\u2019.,!?;:()\-\u2013\u2014]+/g, " ").trim();

/**
 * Did the customer really say this? The AI must quote the words that give an answer; if the quote is not in the customer's
 * message the answer is dropped. This stops a message that is a question, a complaint or a correction from being taken as
 * the answer to whatever happens to be open ("not ₹2 crore" must never become "Not sure").
 */
export function supportedBy(message: string, evidence: unknown): boolean {
  if (typeof evidence !== "string") return false;
  const e = flat(evidence);
  return e.length >= 2 && flat(message).includes(e);
}

const LABEL_STOP = new Set(["your", "what", "have", "does", "with", "that", "this", "there", "from", "every", "month", "monthly", "amount", "approximate", "exact", "currently", "still", "roughly", "about", "give", "tell", "please", "many", "much", "long", "been", "into", "they", "them", "their", "where", "which", "when", "anything", "know", "like"]);

/** Does the message use a key word of the question? A fact volunteered out of turn is only taken when it clearly belongs to that question. */
export function sharesWordWith(label: string, message: string): boolean {
  const m = flat(message);
  return flat(label)
    .split(" ")
    .filter((w) => w.length >= 4 && !LABEL_STOP.has(w))
    .some((w) => m.includes(w.slice(0, Math.max(4, w.length - 2))));
}
