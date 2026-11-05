// Tap-to-choose messages for the WhatsApp assistant: which questions get buttons or a pick-list, what the choices are,
// and how a tap maps back to an answer without any guessing. WhatsApp's limits are enforced here: 3 buttons of up to 20
// characters, or up to 10 list rows of up to 24.

import type { IntakeField } from "./intake-guide";
import { rupees } from "./intake.engine";

export type Choice = { id: string; value: string; english: string };
export type OptionSet = { kind: "buttons" | "list"; choices: Choice[]; titleLimit: number };

/** The loans offered first, as a list. "Something else" lets the customer type it. */
export const MAIN_LOANS: { slug: string; title: string }[] = [
  { slug: "home-loan", title: "Home Loan" },
  { slug: "loan-against-property", title: "Loan Against Property" },
  { slug: "business-loan", title: "Business Loan" },
  { slug: "personal-loan", title: "Personal Loan" },
  { slug: "education-loan", title: "Education Loan" },
  { slug: "new-car-loan", title: "Car Loan" },
  { slug: "balance-transfer", title: "Balance Transfer" },
  { slug: "working-capital-term-loan", title: "Working Capital Loan" },
  { slug: "education-infrastructure-loan", title: "School / College Funding" },
];

/** The website's "You Are" list, so a lead from WhatsApp says the same thing as one from the form. */
export const YOU_ARE = ["Salaried", "Proprietor", "Partner", "Director", "Professional", "NRI", "Other"];

/** The two buttons that ask whether the customer will answer more questions. */
export const MORE_CHOICES = [
  { id: "more|yes", value: "Yes", english: "Yes, continue" },
  { id: "more|no", value: "No", english: "Not now" },
];

/** Ranges of loan amount to pick from. The number is a middle figure that goes on the lead; the exact amount can follow. */
export const AMOUNT_RANGES: { value: number; label: string }[] = [
  { value: 500_000, label: "Up to ₹5 lakh" },
  { value: 750_000, label: "₹5 – 10 lakh" },
  { value: 1_750_000, label: "₹10 – 25 lakh" },
  { value: 3_750_000, label: "₹25 – 50 lakh" },
  { value: 7_500_000, label: "₹50 lakh – 1 crore" },
  { value: 30_000_000, label: "₹1 – 5 crore" },
  { value: 50_000_000, label: "Above ₹5 crore" },
];

/** What the customer tapped, decoded from the id we put on the choice. */
export type Tap =
  | { kind: "loan"; slug: string }
  | { kind: "loan-other" }
  | { kind: "amount"; value: number; label: string }
  | { kind: "amount-type" }
  | { kind: "you"; index: number }
  | { kind: "more"; yes: boolean }
  | { kind: "answer"; key: string; index: number };

export function parseTap(id: string | undefined): Tap | null {
  if (!id) return null;
  const [kind, a, b] = id.split("|");
  if (kind === "loan" && a === "other") return { kind: "loan-other" };
  if (kind === "loan" && a) return { kind: "loan", slug: a };
  if (kind === "amt" && a === "type") return { kind: "amount-type" };
  if (kind === "amt" && a) {
    const value = Number(a);
    const range = AMOUNT_RANGES.find((r) => r.value === value);
    return Number.isFinite(value) && range ? { kind: "amount", value, label: range.label } : null;
  }
  if (kind === "you" && a !== undefined && Number.isInteger(Number(a)) && Number(a) >= 0 && Number(a) < YOU_ARE.length) return { kind: "you", index: Number(a) };
  if (kind === "more" && (a === "yes" || a === "no")) return { kind: "more", yes: a === "yes" };
  if (kind === "ans" && a && b !== undefined && Number.isInteger(Number(b))) return { kind: "answer", key: a, index: Number(b) };
  return null;
}

/** Shorten a title to what WhatsApp allows, at a word boundary where possible. */
export function shorten(text: string, limit: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.5 ? cut.slice(0, space) : cut).trim()}…`;
}

/** The choices to show for a question, or null when it is answered by typing. */
export function optionsFor(key: string, field?: Pick<IntakeField, "kind" | "options">): OptionSet | null {
  if (key === "loan_slug") {
    return {
      kind: "list",
      titleLimit: 24,
      choices: [
        ...MAIN_LOANS.map((l) => ({ id: `loan|${l.slug}`, value: l.slug, english: l.title })),
        { id: "loan|other", value: "other", english: "Something else" },
      ],
    };
  }
  if (key === "applicant") {
    return { kind: "list", titleLimit: 24, choices: YOU_ARE.map((v, i) => ({ id: `you|${i}`, value: v, english: v })) };
  }
  if (key === "more_details") return { kind: "buttons", titleLimit: 20, choices: MORE_CHOICES };
  if (key === "loan_amount") {
    return {
      kind: "list",
      titleLimit: 24,
      choices: [
        ...AMOUNT_RANGES.map((r) => ({ id: `amt|${r.value}`, value: String(r.value), english: r.label })),
        { id: "amt|type", value: "type", english: "Type the exact amount" },
      ],
    };
  }
  const options = field?.options;
  if (field && (field.kind === "choice") && options && options.length >= 2 && options.length <= 10) {
    // buttons cannot carry a longer line, so they are used only when every choice fits in 20 characters
    const asButtons = options.length <= 3 && options.every((o) => o.length <= 20);
    return {
      kind: asButtons ? "buttons" : "list",
      titleLimit: asButtons ? 20 : 24,
      choices: options.map((o, i) => ({ id: `ans|${key}|${i}`, value: o, english: o })),
    };
  }
  return null;
}

export { rupees };
