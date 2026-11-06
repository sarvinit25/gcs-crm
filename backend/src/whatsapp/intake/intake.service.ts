import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, WhatsAppDirection } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { Interactive } from "../whatsapp.provider";
import { answerKey, answersByKey, checkAnswer, loanChoices, loanFor, nextQuestions, parseMoney, resolveField, rupees, withSeeds, type Answers } from "./intake.engine";
import { LANGUAGE_NAME, detectLanguage } from "./intake.language";
import { YOU_ARE, optionsFor, parseTap, shorten, type OptionSet, type Tap } from "./intake.options";

type Turn = { role: "user" | "assistant"; content: string };
type Chat = { role: "system" | "user" | "assistant"; content: string };

/** One thing to ask, or to look for in the customer's reply. */
type Ask = { key: string; question: string; type: string; choices?: string[]; help?: string };

type Extracted = {
  name?: string | null;
  city?: string | null;
  loan_slug?: string | null;
  loan_amount?: string | number | null;
  applicant?: string | null;
  /** True if they agree to answer more questions, false if they decline. */
  more_details?: boolean | null;
  answers?: { key?: string; value?: string }[] | null;
  wants_person?: boolean | null;
  shared_private_number?: boolean | null;
  their_question?: string | null;
  /** The range the customer tapped for the amount, kept as an answer row. */
  amount_range_label?: string | null;
  /** The customer chose to type the loan or the amount themselves. */
  typing?: "loan" | "amount" | null;
  /** They sent a file, photo, video or voice note instead of text: its kind. */
  sent_file?: string | null;
};

type ConversationRef = { id: string; leadId: string | null; name: string | null };
type Snapshot = Awaited<ReturnType<IntakeService["snapshot"]>>;
type Plan = { kind: "ask"; ask: Ask[]; left: number } | { kind: "wrap"; declined: boolean } | { kind: "handoff" };
export type IntakeReply = { text: string | null; handoff: boolean; options?: Interactive; /** Nothing to say, and nobody needs to take over (the customer only said thanks). */ silent?: boolean };

const MAX_HISTORY = 16;
/** After they agree to more questions, the assistant still stops after this many answers: the expert covers the rest on the call. */
const ENOUGH_ANSWERS = 20;
const GENERIC_NAME = /^(whatsapp enquiry|unknown)$/i;
/** The answer rows that record the short first part and the choice to go on. */
const ROW_YOU_ARE = "You are";
const ROW_MORE = "Agreed to answer more questions";
/** A message that only says thanks or ok, in the languages we write in. */
const JUST_THANKS = /^\s*(ok|okay|k|thanks?|thank you|thanks a lot|thx|ty|great|fine|cool|dhanyavad|dhanyawad|shukriya|bahut dhanyavad|theek hai|thik hai|ji|धन्यवाद|बहुत धन्यवाद|शुक्रिया|ठीक है|जी|आभारी आहे|ठीक आहे|ok thanks|okay thanks|ok thank you)[\s.!🙏👍]*$/i;
/** They say they are done with questions ("I'll tell the rest on the call"). Needs clear wording, so an ordinary answer is never mistaken for it. */
export const STOP_ASKING = /\b(on (the )?(call|phone)|during (the )?call|call (par|pe|mein|me)|no more questions|stop asking|enough questions|don'?t ask|do not ask|dont ask|that'?s all|thats all|nothing more|rest (later|on)|baaki (call|baad)|bas (ab|itna|itne)|ab nahi|nahi batana)\b|कॉल पर|कॉल में|बाद में बताऊंगा|बस इतना/i;
/** After "not now", only these words bring the questions back. Writing again, even "hi", does not. */
export const RESUME_ASKING = /\b(continue|go ahead|go on|ask (me|away)|more questions|ask now|chalo|haan|haa|yes|sure|ok ask)\b|चलो|हाँ|हां|होय/i;
/** Words that mean "let me talk to a person" or "I am unhappy". The AI's own judgement is not enough to hand a chat over. */
const WANTS_PERSON = /\b(agent|human|person|real person|representative|executive|manager|call me|call back|callback|talk to|speak to|complaint|complain|fraud|cheat|cheated|useless|worst)\b|बात करनी|बात करना|कॉल करो|phone karo|call karo|baat karni|baat karna/i;
/** A question about rates, approval, documents or charges: only then does the reply answer one. */
const ASKS_ABOUT = /\b(rate|rates|interest|approval|approve|approved|sure|guarantee|guaranteed|eligible|eligibility|document|documents|emi|charge|charges|fee|fees|processing|how much|how long|kitna|kitne|byaj|vyaj|kab)\b|\?/i;

/**
 * Numbers a customer should never send in a chat. They are hidden before anything is sent to OpenAI, so the AI
 * never sees them (the message itself stays in the inbox for staff, as with any WhatsApp chat).
 */
export function scrub(text: string): string {
  return text
    .replace(/\b[A-Za-z]{5}\d{4}[A-Za-z]\b/g, "[PAN removed]")
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[ID number removed]")
    .replace(/\b(otp|pin|cvv|password|passcode)\b[^\n]{0,20}?\d{3,8}/gi, "[$1 removed]")
    // an account or card number: a long number after the word, or one as long as a card (a mobile number or an amount is shorter)
    .replace(/\b(account|acct|a\/c|ac no|card|ifsc)\b[^\n]{0,25}?\d{9,18}/gi, "[$1 number removed]")
    .replace(/\b\d{13,19}\b/g, "[number removed]");
}

/**
 * The WhatsApp assistant that collects a customer's details, in two parts like the website's two forms. Part 1 is short
 * (which loan, how much, name, city, what they are), one question at a time, mostly taps. Then she asks whether they
 * would like to go on; if so, Part 2 is the loan's own questions, again one at a time. The CODE decides what is asked next
 * and saves what is learned; the AI only reads the customer's typed words and words the next message in the customer's
 * own language. It is switched on in Settings -> WhatsApp.
 */
@Injectable()
export class IntakeService {
  private readonly log = new Logger("WhatsAppIntake");

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private config: ConfigService,
  ) {}

  enabled() {
    return this.settings.get<boolean>("whatsapp.aiIntake") && Boolean(this.config.get<string>("OPENAI_API_KEY")?.trim());
  }

  /** The reply to send to the customer, or null if the assistant has nothing to say (a person takes over). */
  async reply(conversation: ConversationRef, replyId?: string, media?: string): Promise<IntakeReply> {
    if (!conversation.leadId) return { text: null, handoff: false };
    const leadId = conversation.leadId;
    const turns = await this.history(conversation.id);
    if (!turns.length && !media) return { text: null, handoff: false };
    const lastTyped = [...turns].reverse().find((t) => t.role === "user" && !t.content.startsWith("(tapped)"))?.content ?? "";

    // 1. What did the customer say? A tap is exact; typed words are read by the AI.
    let before = await this.snapshot(leadId);
    const tap = parseTap(replyId);
    // Someone who said "not now" stays at "not now" until they clearly ask to go on; just writing again does not restart the questions.
    if (!tap && !media && before.more === "No" && before.basicsDone && RESUME_ASKING.test(lastTyped)) {
      await this.writeAnswer(leadId, ROW_MORE, "Yes");
      before = await this.snapshot(leadId);
    }
    // And someone who says they will give the rest on the call is not asked anything more.
    if (!tap && !media && before.more !== "No" && before.basicsDone && STOP_ASKING.test(lastTyped)) {
      await this.writeAnswer(leadId, ROW_MORE, "No");
      before = await this.snapshot(leadId);
    }
    const asked = this.focus(before).ask;
    // A file, photo or voice note cannot be read here: nothing is learned from it, and the same question is asked again.
    const extracted: Extracted | null = media ? { sent_file: media } : tap ? this.fromTap(tap, before) : await this.extract(turns, asked, before);
    if (!extracted) return { text: null, handoff: true };
    if (media && !media.startsWith("saved") && !["audio", "sticker"].includes(media)) await this.writeAnswer(leadId, "Tried to send a file on WhatsApp", `${media.replace(/_/g, " ")} (not kept: ask for it on the call)`);
    // These are decided on the customer's LATEST typed message only, in code, so an old message cannot keep raising them.
    if (!tap && !media) {
      const latest = await this.prisma.whatsAppMessage.findFirst({
        where: { conversationId: conversation.id, direction: WhatsAppDirection.IN, type: "text", body: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { body: true },
      });
      const raw = latest?.body ?? "";
      extracted.shared_private_number = scrub(raw) !== raw;
      extracted.wants_person = Boolean(extracted.wants_person) && WANTS_PERSON.test(raw);
      if (!ASKS_ABOUT.test(raw)) extracted.their_question = null;
    }
    // A first message often says several things at once ("40 lakh home loan"); after that only what was asked counts, so a
    // price or an EMI mentioned in passing is never taken for the loan amount.
    const firstMessage = !turns.some((t) => t.role === "assistant");
    const allowed = new Set(tap?.kind === "answer" ? [tap.key] : asked.map((a) => a.key));
    if (firstMessage) ["loan_slug", "loan_amount", "name", "city", "applicant"].forEach((k) => allowed.add(k));
    const { saved, figures } = await this.apply(leadId, extracted, allowed);

    // everything is in and they have been told an expert will call: a bare "thanks" needs no answer
    const after = await this.snapshot(leadId);
    if (!tap && JUST_THANKS.test(lastTyped) && this.toAsk(after).length === 0) return { text: null, handoff: false, silent: true };

    // 2. Decide, in code, what to do next.
    let plan: Plan;
    let options: OptionSet | null = null;
    if (extracted.wants_person) plan = { kind: "handoff" };
    else {
      const next = this.toAsk(after);
      const answeredLoanQuestions = Object.keys(after.answers).length;
      const finished = next.length === 0 || (after.more === "Yes" && answeredLoanQuestions >= ENOUGH_ANSWERS);
      if (finished) plan = { kind: "wrap", declined: after.more === "No" };
      else {
        const f = this.focus(after);
        const first = f.ask[0]!;
        const typeIt = (extracted.typing === "loan" && first.key === "loan_slug") || (extracted.typing === "amount" && first.key === "loan_amount");
        options = typeIt ? null : f.options;
        const left = after.loanSlug && after.more === "Yes" ? nextQuestions(after.loanSlug, after.answers, 1).remaining : 0;
        plan = { kind: "ask", ask: f.ask, left };
      }
    }
    if (process.env.WHATSAPP_AI_DEBUG) this.log.warn(`read ${JSON.stringify(extracted)} | saved ${JSON.stringify(saved)} | next ${plan.kind}${options ? ` with ${options.kind}` : ""}`);

    // 3. Word the reply.
    const written = await this.write(turns, plan, extracted, saved, after, options, tap ? [] : figures);
    if (!written) return { text: null, handoff: plan.kind === "handoff" };
    return { text: written.text, handoff: plan.kind === "handoff", ...(written.options ? { options: written.options } : {}) };
  }

  /** What is asked of the customer next, and the tap-to-choose options for it. The same call decides what the AI may fill in. */
  private focus(snap: Snapshot): { ask: Ask[]; options: OptionSet | null } {
    const first = this.toAsk(snap)[0];
    if (!first) return { ask: [], options: null };
    return { ask: [first], options: optionsFor(first.key, { kind: first.type as "choice", options: first.choices }) };
  }

  // -- the lead as it stands ---------------------------------------------------------------------

  private async snapshot(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { name: true, city: true, amount: true, loanProduct: { select: { slug: true, name: true } }, answers: { select: { key: true, value: true } } },
    });
    const rows = lead?.answers ?? [];
    const loanSlug = lead?.loanProduct?.slug ?? null;
    const answers = answersByKey(loanSlug, rows);
    const applicant = rows.find((r) => r.key === answerKey(ROW_YOU_ARE))?.value ?? null;
    const more = (rows.find((r) => r.key === answerKey(ROW_MORE))?.value as "Yes" | "No" | undefined) ?? undefined;
    // Part 1, in this order: the loan and the amount as tap lists, then who they are
    const missing: string[] = [];
    if (!loanSlug) missing.push("loan_slug");
    if (!lead?.amount) missing.push("loan_amount");
    if (!lead || GENERIC_NAME.test(lead.name)) missing.push("name");
    if (!lead?.city) missing.push("city");
    if (!applicant) missing.push("applicant");
    return { lead, loanSlug, loanName: lead?.loanProduct?.name ?? null, answers, applicant, more, missing, basicsDone: missing.length === 0 };
  }

  /** What to ask next: ONE thing. Part 1's basics, then whether to go on, then (if they agreed) the loan's own questions. */
  private toAsk(snap: Snapshot): Ask[] {
    const basics: Record<string, Ask> = {
      name: { key: "name", question: "Their name", type: "text" },
      city: { key: "city", question: "The city they live or work in", type: "text" },
      loan_slug: { key: "loan_slug", question: "Which loan they need", type: "choice" },
      loan_amount: { key: "loan_amount", question: "About how much they need", type: "choice" },
      applicant: { key: "applicant", question: "What describes them best (salaried, own business, professional...)", type: "choice", choices: YOU_ARE },
    };
    const first = snap.missing[0];
    if (first) return [basics[first]!];
    // Part 1 is done. Only a loan that has detailed questions has a Part 2 to offer.
    if (!loanFor(snap.loanSlug)) return [];
    if (snap.more === undefined) {
      return [{ key: "more_details", question: "Whether they are happy to answer a few more questions so the experts can find better offers", type: "choice", choices: ["Yes", "No"] }];
    }
    if (snap.more === "No" || !snap.loanSlug) return [];
    const { fields } = nextQuestions(snap.loanSlug, snap.answers, 1);
    return fields.map((f) => ({ key: f.key, question: f.label, type: f.kind, ...(f.options ? { choices: f.options } : {}), ...(f.help ? { help: f.help } : {}) }));
  }

  private async history(conversationId: string): Promise<Turn[]> {
    const rows = await this.prisma.whatsAppMessage.findMany({
      where: { conversationId, type: { in: ["text", "interactive"] }, body: { not: null } },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY,
      select: { direction: true, type: true, body: true },
    });
    return rows.reverse().map((m) => {
      const mine = m.direction === WhatsAppDirection.IN;
      // the choices staff see under a message are not part of what was said; a tap is marked, so the AI knows it was a pick
      const text = mine ? scrub(m.body ?? "") : (m.body ?? "").replace(/\n+▫[\s\S]*$/, "");
      return { role: mine ? ("user" as const) : ("assistant" as const), content: mine && m.type === "interactive" ? `(tapped) ${text}` : text };
    });
  }

  // -- job 1: understand the customer ---------------------------------------------------------

  /** A tap needs no AI: the id says exactly what was chosen. */
  private fromTap(tap: Tap, snap: Snapshot): Extracted {
    if (tap.kind === "loan") return { loan_slug: tap.slug };
    if (tap.kind === "loan-other") return { typing: "loan" };
    if (tap.kind === "amount") return { loan_amount: tap.value, amount_range_label: tap.label };
    if (tap.kind === "amount-type") return { typing: "amount" };
    if (tap.kind === "you") return { applicant: YOU_ARE[tap.index] ?? null };
    if (tap.kind === "more") return { more_details: tap.yes };
    const field = loanFor(snap.loanSlug)?.fields.find((f) => f.key === tap.key);
    const value = field?.options?.[tap.index];
    return value ? { answers: [{ key: tap.key, value }] } : {};
  }

  private async extract(turns: Turn[], asked: Ask[], snap: Snapshot): Promise<Extracted | null> {
    const loans = snap.loanSlug
      ? ""
      : `\nLoans (for loan_slug use the left part):\n${loanChoices()
          .map((l) => `${l.slug} = ${l.title}`)
          .join("\n")}`;
    const system = `You read a customer's WhatsApp messages to a loan company and pull out facts. Reply with ONE JSON object only.

Question that was just asked (fill the answer to this only):
${JSON.stringify(asked)}${loans}

Return: {"name": string|null, "city": string|null, "loan_slug": string|null, "loan_amount": number|null, "applicant": string|null, "more_details": boolean|null, "answers": [{"key": string, "value": string}], "wants_person": boolean, "shared_private_number": boolean, "their_question": string|null}
Rules:
- Fill only what the customer clearly said in their LATEST message(s) since the assistant last spoke, in answer to the question above. Never guess and never infer from context: if their words do not state it, leave it out. Use null or [] otherwise.
- Numbers may be written as Hindi or Marathi words, in English or Devanagari letters (ek, do, teen, paanch, das, pachchis, chabbis = 26, pachaas = 50, sau = 100; "chabbis lakh" = 26 lakh = 2600000; "डेढ़ करोड़" = 15000000). Convert them to a rupee number.
- "answers": use the exact "key" from the question above. For a question with choices, "value" must be one of the choices, written exactly. The customer may write in Hindi, Marathi or Hinglish: translate their meaning to the matching choice. For amounts give a rupee number (40 lakh = 4000000, 2 crore = 20000000). For yes/no questions use "Yes" or "No".
- applicant: only if asked, and one of: Salaried, Proprietor, Partner, Director, Professional, NRI, Other (a shop or business owner on their own = Proprietor; a doctor, CA or similar = Professional).
- more_details: only if asked. true if they agree to go on ("yes", "ok", "sure", "haan", "chalo", "होय"), false if they decline ("not now", "later", "no", "nahi").
- Messages marked "(tapped)" are the customer's pick from a list we showed; the text after it is the option's title.
- loan_slug: only if they clearly name a loan, or what it is for matches one loan; otherwise null.
- wants_person: true if they ask for a person or a call, or are upset.
- shared_private_number: true if they sent a PAN, Aadhaar, OTP, password, card or bank account number (these appear as [... removed]).
- their_question: a question asked in their LATEST message only (rates, approval, documents...) in a few words, else null. Do not repeat a question from an earlier message.`;
    const raw = await this.complete([{ role: "system", content: system }, ...turns], { json: true, maxTokens: 500 });
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as Extracted;
    } catch {
      this.log.error("The model's reading of a message was not valid JSON");
      return {};
    }
  }

  /** Saves what was read. Returns the plain names of what was saved. */
  private async apply(leadId: string, x: Extracted, allowed: Set<string>) {
    const saved: string[] = [];
    /** Amounts as they were read, so they can be repeated back to the customer for a check. */
    const figures: string[] = [];
    const data: Prisma.LeadUpdateInput = {};
    const current = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { name: true, city: true } });

    const name = typeof x.name === "string" ? x.name.trim().slice(0, 120) : "";
    if (name.length >= 2 && current && GENERIC_NAME.test(current.name)) {
      data.name = name;
      saved.push("name");
    }
    // a city that was just given is welcome even when something else was asked, but it is not changed once it is set
    const city = typeof x.city === "string" ? x.city.trim().slice(0, 80) : "";
    if (city.length >= 2 && (allowed.has("city") || !current?.city)) {
      data.city = city;
      saved.push("city");
    }
    const amount = allowed.has("loan_amount") && x.loan_amount !== null && x.loan_amount !== undefined ? parseMoney(String(x.loan_amount)) : null;
    if (amount && amount > 0) {
      data.amount = amount;
      saved.push("loan amount");
      figures.push(`loan amount ${rupees(amount)}`);
      if (x.amount_range_label) await this.writeAnswer(leadId, "Loan amount asked (range chosen)", x.amount_range_label);
    }
    const wanted = allowed.has("loan_slug") && typeof x.loan_slug === "string" ? x.loan_slug.trim() : "";
    if (wanted && loanFor(wanted)) {
      const product = await this.prisma.loanProduct.findUnique({ where: { slug: wanted }, select: { id: true } });
      if (product) {
        data.loanProduct = { connect: { id: product.id } };
        saved.push("loan");
      }
    }
    if (Object.keys(data).length) await this.prisma.lead.update({ where: { id: leadId }, data });

    const who = allowed.has("applicant") && typeof x.applicant === "string" ? YOU_ARE.find((v) => v.toLowerCase() === x.applicant!.trim().toLowerCase()) : undefined;
    if (who) {
      await this.writeAnswer(leadId, ROW_YOU_ARE, who);
      saved.push("you are");
    }
    if (allowed.has("more_details") && typeof x.more_details === "boolean") {
      await this.writeAnswer(leadId, ROW_MORE, x.more_details ? "Yes" : "No");
      saved.push("more details");
    }

    const snap = await this.snapshot(leadId);
    const loan = loanFor(snap.loanSlug);
    if (!loan || !snap.loanSlug) return { saved, figures };
    const answers: Answers = { ...snap.answers };
    for (const a of Array.isArray(x.answers) ? x.answers : []) {
      const field = resolveField(snap.loanSlug, answers, String(a?.key ?? ""), String(a?.value ?? ""));
      if (!field || !allowed.has(field.key)) continue; // only what was actually asked
      const checked = checkAnswer(field, String(a?.value ?? ""));
      if (!checked.ok) continue;
      await this.writeAnswer(leadId, field.label, checked.value);
      answers[field.key] = checked.value;
      saved.push(field.label);
      if (field.kind === "amount") figures.push(`${field.label}: ${checked.value}`);
      if (field.key === "loanKind") {
        // a chosen kind of loan already answers some of the later questions
        for (const [seedKey, seedValue] of Object.entries(withSeeds(loan, answers))) {
          const seedField = loan.fields.find((f) => f.key === seedKey);
          if (seedField && !(seedKey in answers)) {
            await this.writeAnswer(leadId, seedField.label, seedValue);
            answers[seedKey] = seedValue;
          }
        }
      }
    }
    return { saved, figures };
  }

  private writeAnswer(leadId: string, label: string, value: string) {
    const key = answerKey(label);
    return this.prisma.leadAnswer.upsert({
      where: { leadId_key: { leadId, key } },
      create: { leadId, stage: "whatsapp", key, label: label.slice(0, 80), value: value.slice(0, 500) },
      update: { stage: "whatsapp", label: label.slice(0, 80), value: value.slice(0, 500) },
    });
  }

  // -- job 2: word the reply --------------------------------------------------------------------

  private async write(turns: Turn[], plan: Plan, x: Extracted, saved: string[], snap: Snapshot, options: OptionSet | null, figures: string[]): Promise<{ text: string; options?: Interactive } | null> {
    const company = this.settings.get<string>("org.name") || "Growth Capital Services";
    const system = `You are Gia, the WhatsApp assistant of ${company}, a loan consultant (a DSA) in Mumbai that helps people compare loan options from 75+ banks and NBFCs, free of charge to the customer. You are NOT the lender.

YOUR PERSONALITY
You are like a friendly, sharp young person at a good financial firm who genuinely enjoys helping and chats naturally: warm, upbeat, curious, never stiff, never pushy. You are having a conversation, not filling in a form.
- React to what they just told you, in a few natural words that show you listened ("A school building, that is a lovely project", "Kia, nice choice", "Thane is a great area"). Make the reaction specific to THEIR answer. Never just say "Thanks" or "Noted".
- Vary how you start. NEVER open a message with "Thanks", "Thank you" or "Great": open with a reaction to what they said, or a friendly link to the next question. Say their FIRST name only (never the full name), and rarely: in most messages do not use their name at all (about one message in four).
- Link to the next question the way a person would ("And on the money side...", "Next up", "One more thing"), so each question flows from the last. Only say "almost there", "nearly done" or "last one" when your task says so.
- Keep it light and short. 1 to 3 short sentences. At most one emoji, and only now and then. No bullet points, no bold, no headings.
- Ask ONLY what your task says, ONE question at a time. Never invent questions, and never mention keys, tools, forms or "saving".

SAFETY
- Never promise anything about rates, approval, amounts or timelines: say it depends on the bank or NBFC and their profile, and an expert will confirm.
- Never ask for an OTP, password, PIN, card number, bank account number, Aadhaar or PAN. If they sent one, kindly tell them not to share it here: our expert will collect documents safely.
- Only loans and our services. For anything else, politely say you can only help with loans.

LANGUAGE AND STYLE: write in the language the customer TYPED, not the language of their taps. English is the default, and "hi" or "hello" is English. Never mix languages in one message.
- English: warm, natural, simple words.
- Hinglish (Hindi in English letters, e.g. "mujhe home loan chahiye"): reply fully in Hinglish, respectful "aap" (aapka, aapko, kijiye), with everyday English words for loan, amount, income and city. Example: "Namaste! Main Gia hoon, Growth Capital Services se. Aapko kaunsa loan chahiye?"
- Hindi in Devanagari: reply in Devanagari, polite "आप". Example: "नमस्ते! मैं गिया हूँ, ग्रोथ कैपिटल सर्विसेज़ से। आपको कौन-सा लोन चाहिए?"
- Marathi in Devanagari: reply in Marathi, polite "तुम्ही / तुमचे". Example: "नमस्कार! मी गिया, ग्रोथ कॅपिटल सर्विसेसमधून. तुम्हाला कोणते कर्ज हवे आहे?"`;

    const known = [snap.lead && !GENERIC_NAME.test(snap.lead.name) ? `first name ${snap.lead.name.trim().split(/\s+/)[0]}` : null, snap.lead?.city ? `city ${snap.lead.city}` : null, snap.loanName ? `loan ${snap.loanName}` : null, snap.applicant ? `they are: ${snap.applicant}` : null].filter(Boolean).join(", ");
    const lines: string[] = [`LANGUAGE FOR THIS MESSAGE (decided from what the customer typed): ${LANGUAGE_NAME[detectLanguage(turns)]}. Write the whole message, and any option titles, in it. Do not drift into another language, including in a thank-you or goodbye.`];
    const first = turns.filter((t) => t.role === "assistant").length === 0;
    if (first) {
      lines.push(
        "This is the customer's first message, so this is your WELCOME. In two or three short sentences: greet them warmly (one emoji is fine), say you are Gia from the company, that you compare loan offers from 75+ banks and NBFCs for them at no cost, and that you will ask a few quick questions (about a minute). Then ask your first question.",
      );
    }
    if (x.sent_file === "audio") lines.push("They sent a voice note, which you cannot listen to here. Kindly say so and ask them to type, or tap an option, instead. Then ask the question again.");
    else if (x.sent_file?.startsWith("saved")) lines.push(`They sent a ${x.sent_file === "saved_image" ? "photo" : "document"} and it has been saved safely on their file. Say "photo" or "document" exactly as written here, never the other word. Thank them warmly in one line, say our expert will look at it, and that they need not send anything else for now. Then ask the question again.`);
    else if (x.sent_file === "not_saved_unsupported") lines.push("They sent a file that could not be kept (only PDF, JPG, PNG, WebP or HEIC work). Kindly ask them to send it again as a PDF or a clear photo, or say our expert will collect it later. Then ask the question again.");
    else if (x.sent_file === "not_saved_too_large") lines.push("They sent a file that is too big (the limit is 15 MB). Kindly ask them to send a smaller one or a photo, or say our expert will collect it later. Then ask the question again.");
    else if (x.sent_file === "not_saved_failed") lines.push("They sent a file but it could not be saved just now. Apologise briefly, ask them to try once more, or say our expert will collect it later. Then ask the question again.");
    else if (x.sent_file === "video") lines.push("They sent a video, which cannot be opened here. Kindly ask for a photo or PDF instead, or say our expert will collect it later. Then ask the question again.");
    else if (x.sent_file) lines.push("They sent something that cannot be opened here. Kindly say so and ask them to type or tap an option instead. Then ask the question again.");
    if (x.shared_private_number) lines.push("They sent a private number (it was hidden from you). Tell them kindly not to share such numbers here.");
    if (x.their_question) lines.push(`They asked: "${x.their_question}". Answer in one or two safe sentences (no promises), then continue.`);
    if (!saved.length && plan.kind === "ask" && !x.typing && !x.sent_file && !first) lines.push("They did not answer the last question. Ask it again in simpler words, in a friendly way.");
    if (figures.length) lines.push(`They typed an amount in their own words. Repeat it back once, briefly and naturally, in digits, so they can correct it if it is wrong. Use exactly these figures: ${figures.join("; ")}.`);
    if (x.typing === "loan") lines.push("They chose to type which loan they need. Ask them to type it in their own words.");
    if (x.typing === "amount") lines.push("They chose to type the amount. Ask them to type about how much they need, for example 25 lakh.");

    if (plan.kind === "ask") {
      const a = plan.ask[0]!;
      if (a.key === "more_details") {
        lines.push(
          `This is the BRIDGE between the short first part and the longer second part. They have answered the quick questions. Warmly thank them by first name and tell them an expert can already call them with what they have shared. Then, in a friendly way, say that if they have two minutes, a few more questions will help our experts shortlist the best banks and offers for them, and ask if they would like to continue now. The customer will tap Yes or Not now. Do NOT ask any other question.`,
        );
      } else {
        lines.push(`Ask exactly this ONE question:\n${a.question}${!options && a.choices ? (a.choices.length > 6 ? ` [there are many possible answers; do NOT list them: just ask openly, you may give two or three examples such as ${a.choices.slice(0, 3).join(", ")}]` : ` [choices: ${a.choices.join(" | ")}]`) : ""}${a.help ? ` (${a.help})` : ""}`);
        if (snap.more === "Yes" && plan.left > 0) {
          lines.push(
            plan.left === 1
              ? "This is the LAST question: say so."
              : plan.left <= 3
                ? `About ${plan.left} questions are left: you can say you are almost done.`
                : `About ${plan.left} questions are left in this longer part. You may mention once in a while that it is a few more, but do not announce it every time.`,
          );
        }
      }
      if (options) lines.push("The customer will tap one of the options listed below the message, so do NOT list the options in your message; just ask the question.");
    } else if (plan.kind === "wrap") {
      lines.push(
        plan.declined
          ? "They would rather not answer more questions now. Say that is perfectly fine, an expert from our team will contact them soon with what they have shared, and they can message here any time to add more details. If they only said hello or something small, welcome them back in one short line and say that if they wish to carry on with the questions they can just say continue. Do not ask any question."
          : "You have what is needed. Thank them warmly by first name and say an expert from our team will contact them soon and will go through anything else. Do not ask any more questions. If one of your earlier messages already said an expert will contact them, do NOT say it again: reply with one short friendly closing line only.",
      );
    } else {
      lines.push("They want a person. Say a team member will message them here soon. Do not ask any questions.");
    }

    const messages: Chat[] = [{ role: "system", content: system }, ...turns];
    if (!options) {
      messages.push({ role: "system", content: `TASK for your next message. Already known about the customer: ${known || "nothing yet"}.\n${lines.join("\n")}` });
      const text = await this.complete(messages, { maxTokens: 350, temperature: 0.7 });
      return text ? { text: text.trim() } : null;
    }

    // a tap-to-choose message: the AI words the question and translates the labels of the choices
    const limit = options.titleLimit;
    lines.push(
      `Reply as ONE JSON object: {"body": "<your message>", "option_titles": [<one title per option, same order>], "menu_label": "<a word for the list button, at most 20 characters, such as Choose>"}.\nThe options, in order:\n${options.choices.map((c, i) => `${i + 1}. ${c.english}`).join("\n")}\nWrite each option title in the language of your message, AT MOST ${limit} characters, no emoji. If an option is longer than that, REWRITE it shorter with the same meaning (for example "Ready-to-move flat or house" becomes "Ready flat / house"); never cut a word off. Loan names such as "Home Loan" may stay in English. Keep money figures as they are.`,
    );
    messages.push({ role: "system", content: `TASK for your next message. Already known about the customer: ${known || "nothing yet"}.\n${lines.join("\n")}` });
    const raw = await this.complete(messages, { json: true, maxTokens: 500, temperature: 0.7 });
    if (!raw) return null;
    let body = "";
    let titles: string[] = [];
    let menu = "Choose";
    try {
      const parsed = JSON.parse(raw) as { body?: string; option_titles?: unknown; menu_label?: string };
      body = String(parsed.body ?? "").trim();
      if (Array.isArray(parsed.option_titles)) titles = parsed.option_titles.map((t) => String(t));
      if (parsed.menu_label) menu = shorten(String(parsed.menu_label), 20);
    } catch {
      body = raw.trim();
    }
    if (!body) return null;
    const rows = options.choices.map((c, i) => {
      const title = shorten(titles.length === options.choices.length && titles[i] ? titles[i]! : c.english, limit);
      // a list row can carry a longer line under its title: use it when the title had to be short
      const full = options.kind === "list" && c.english.length > title.length && c.english.length <= 72 ? { description: c.english } : {};
      return { id: c.id, title, ...full };
    });
    const content: Interactive = options.kind === "buttons" ? { kind: "buttons", body, buttons: rows } : { kind: "list", body, button: menu, rows };
    return { text: body, options: content };
  }

  // -- OpenAI -----------------------------------------------------------------------------------

  private async complete(messages: Chat[], opts: { json?: boolean; maxTokens: number; temperature?: number }): Promise<string | null> {
    const model = this.config.get<string>("WHATSAPP_AI_MODEL")?.trim() || "gpt-4.1-mini";
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.get<string>("OPENAI_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: opts.maxTokens,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: "low" } : { temperature: opts.temperature ?? 0 }),
        }),
        signal: AbortSignal.timeout(40_000),
      });
      if (!res.ok) {
        this.log.error(`OpenAI answered HTTP ${res.status}`);
        return null;
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      return json.choices?.[0]?.message?.content ?? null;
    } catch (error) {
      this.log.error(`OpenAI request failed: ${(error as Error).message}`);
      return null;
    }
  }
}
