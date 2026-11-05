import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, WhatsAppDirection } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { Interactive } from "../whatsapp.provider";
import { answerKey, answersByKey, checkAnswer, loanChoices, loanFor, nextQuestions, parseMoney, resolveField, withSeeds, type Answers } from "./intake.engine";
import { LANGUAGE_NAME, detectLanguage } from "./intake.language";
import { optionsFor, parseTap, shorten, type OptionSet, type Tap } from "./intake.options";

type Turn = { role: "user" | "assistant"; content: string };
type Chat = { role: "system" | "user" | "assistant"; content: string };

/** One thing to ask, or to look for in the customer's reply. */
type Ask = { key: string; question: string; type: string; choices?: string[]; help?: string };

type Extracted = {
  name?: string | null;
  city?: string | null;
  loan_slug?: string | null;
  loan_amount?: string | number | null;
  answers?: { key?: string; value?: string }[] | null;
  wants_person?: boolean | null;
  shared_private_number?: boolean | null;
  their_question?: string | null;
  /** The range the customer tapped for the amount, kept as an answer row. */
  amount_range_label?: string | null;
  /** The customer chose to type the loan or the amount themselves. */
  typing?: "loan" | "amount" | null;
};

type ConversationRef = { id: string; leadId: string | null; name: string | null };
type Snapshot = Awaited<ReturnType<IntakeService["snapshot"]>>;
type Plan = { kind: "ask"; ask: Ask[] } | { kind: "wrap" } | { kind: "handoff" };
export type IntakeReply = { text: string | null; handoff: boolean; options?: Interactive; /** Nothing to say, and nobody needs to take over (the customer only said thanks). */ silent?: boolean };

const MAX_HISTORY = 14;
/** A message that only says thanks or ok, in the languages we write in. */
const JUST_THANKS = /^\s*(ok|okay|k|thanks?|thank you|thanks a lot|thx|ty|great|fine|cool|dhanyavad|dhanyawad|shukriya|bahut dhanyavad|theek hai|thik hai|ji|धन्यवाद|बहुत धन्यवाद|शुक्रिया|ठीक है|जी|आभारी आहे|धन्यवाद!?|ठीक आहे|ok thanks|okay thanks|ok thank you)[\s.!🙏👍]*$/i;
/** After this many answers on the loan's own questions the assistant wraps up: the expert asks the rest on the call. */
const ENOUGH_ANSWERS = 12;
const GENERIC_NAME = /^(whatsapp enquiry|unknown)$/i;
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
 * The WhatsApp assistant that collects a customer's details. The CODE decides what is asked next (the same questions, in
 * the same order, as the website's forms), offers tap-to-choose answers where there are set choices, and saves what is
 * learned; the AI only does two small jobs: read the customer's typed message for answers to the questions that were
 * asked, and word the next message in the customer's own language. It is switched on in Settings -> WhatsApp.
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
  async reply(conversation: ConversationRef, replyId?: string): Promise<IntakeReply> {
    if (!conversation.leadId) return { text: null, handoff: false };
    const leadId = conversation.leadId;
    const turns = await this.history(conversation.id);
    if (!turns.length) return { text: null, handoff: false };

    // 1. What did the customer say? A tap is exact; typed words are read by the AI.
    const before = await this.snapshot(leadId);
    const tap = parseTap(replyId);
    const asked = this.focus(before).ask;
    const extracted = tap ? this.fromTap(tap, before) : await this.extract(turns, asked, before);
    if (!extracted) return { text: null, handoff: true };
    // These are decided on the customer's LATEST typed message only, in code, so an old message cannot keep raising them.
    if (!tap) {
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
    const saved = await this.apply(leadId, extracted, new Set(tap?.kind === "answer" ? [tap.key] : asked.map((a) => a.key)));
    // everything needed is in and an expert has been promised: a bare "thanks" needs no answer
    const lastTyped = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
    if (!tap && JUST_THANKS.test(lastTyped) && this.toAsk(await this.snapshot(leadId)).length === 0) return { text: null, handoff: false, silent: true };

    // 2. Decide, in code, what to do next.
    const after = await this.snapshot(leadId);
    let plan: Plan;
    let options: OptionSet | null = null;
    if (extracted.wants_person) plan = { kind: "handoff" };
    else {
      const next = this.toAsk(after);
      const finished = next.length === 0 || (after.basicsDone && Object.keys(after.answers).length >= ENOUGH_ANSWERS);
      if (finished) plan = { kind: "wrap" };
      else {
        const f = this.focus(after);
        const first = f.ask[0]!;
        const typeIt = (extracted.typing === "loan" && first.key === "loan_slug") || (extracted.typing === "amount" && first.key === "loan_amount");
        options = typeIt ? null : f.options;
        plan = { kind: "ask", ask: typeIt ? [first] : f.ask };
      }
    }
    if (process.env.WHATSAPP_AI_DEBUG) this.log.warn(`read ${JSON.stringify(extracted)} | saved ${JSON.stringify(saved)} | next ${plan.kind}${options ? ` with ${options.kind}` : ""}`);

    // 3. Word the reply.
    const written = await this.write(turns, plan, extracted, saved, after, options);
    if (!written) return { text: null, handoff: plan.kind === "handoff" };
    return { text: written.text, handoff: plan.kind === "handoff", ...(written.options ? { options: written.options } : {}) };
  }

  /**
   * What is asked of the customer next, and the tap-to-choose options for it. The same call decides what the AI may fill in
   * from the customer's reply, so a question that was never asked cannot be answered by guesswork.
   */
  private focus(snap: Snapshot): { ask: Ask[]; options: OptionSet | null } {
    const next = this.toAsk(snap);
    const first = next[0];
    if (!first) return { ask: [], options: null };
    const opts = (a: Ask) => optionsFor(a.key, { kind: a.type as "choice", options: a.choices });
    const options = opts(first);
    const second = next[1];
    // a question with choices is asked on its own; so is a typed question that is followed by a choice question
    const alone = Boolean(options) || Boolean(second && opts(second));
    return { ask: alone ? [first] : next, options };
  }

  // -- the lead as it stands ---------------------------------------------------------------------

  private async snapshot(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { name: true, city: true, amount: true, loanProduct: { select: { slug: true, name: true } }, answers: { select: { key: true, value: true } } },
    });
    const loanSlug = lead?.loanProduct?.slug ?? null;
    const answers = answersByKey(loanSlug, lead?.answers ?? []);
    // loan and amount first, as tap lists; then who they are
    const missing: string[] = [];
    if (!loanSlug) missing.push("loan_slug");
    if (!lead?.amount) missing.push("loan_amount");
    if (!lead || GENERIC_NAME.test(lead.name)) missing.push("name");
    if (!lead?.city) missing.push("city");
    return { lead, loanSlug, loanName: lead?.loanProduct?.name ?? null, answers, missing, basicsDone: missing.length === 0 };
  }

  /** What to ask next: the basics first (two at most), then the loan's own questions, two at a time. */
  private toAsk(snap: Snapshot): Ask[] {
    const basics: Record<string, Ask> = {
      name: { key: "name", question: "Their name", type: "text" },
      city: { key: "city", question: "The city they live or work in", type: "text" },
      loan_slug: { key: "loan_slug", question: "Which loan they need", type: "choice" },
      loan_amount: { key: "loan_amount", question: "About how much they need", type: "choice" },
    };
    const out: Ask[] = snap.missing.slice(0, 2).map((k) => basics[k]!);
    if (out.length < 2 && snap.loanSlug) {
      const { fields } = nextQuestions(snap.loanSlug, snap.answers, 2 - out.length);
      out.push(...fields.map((f) => ({ key: f.key, question: f.label, type: f.kind, ...(f.options ? { choices: f.options } : {}), ...(f.help ? { help: f.help } : {}) })));
    }
    return out;
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

Questions that were just asked (fill answers to these only):
${JSON.stringify(asked)}${loans}

Return: {"name": string|null, "city": string|null, "loan_slug": string|null, "loan_amount": number|null, "answers": [{"key": string, "value": string}], "wants_person": boolean, "shared_private_number": boolean, "their_question": string|null}
Rules:
- Fill only what the customer clearly said in their LATEST message(s) since the assistant last spoke, in answer to the questions above. Never guess and never infer from context: if their words do not state it, leave it out. Use null or [] otherwise.
- "answers": use the exact "key" from the list above. For a question with choices, "value" must be one of the choices, written exactly. The customer may write in Hindi, Marathi or Hinglish: translate their meaning to the matching choice. For amounts give a rupee number (40 lakh = 4000000, 2 crore = 20000000). For yes/no questions use "Yes" or "No".
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
    const data: Prisma.LeadUpdateInput = {};
    const current = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { name: true } });

    const name = typeof x.name === "string" ? x.name.trim().slice(0, 120) : "";
    if (name.length >= 2 && current && GENERIC_NAME.test(current.name)) {
      data.name = name;
      saved.push("name");
    }
    const city = typeof x.city === "string" ? x.city.trim().slice(0, 80) : "";
    if (city.length >= 2) {
      data.city = city;
      saved.push("city");
    }
    const amount = x.loan_amount !== null && x.loan_amount !== undefined ? parseMoney(String(x.loan_amount)) : null;
    if (amount && amount > 0) {
      data.amount = amount;
      saved.push("loan amount");
      if (x.amount_range_label) await this.writeAnswer(leadId, "Loan amount asked (range chosen)", x.amount_range_label);
    }
    const wanted = typeof x.loan_slug === "string" ? x.loan_slug.trim() : "";
    if (wanted && loanFor(wanted)) {
      const product = await this.prisma.loanProduct.findUnique({ where: { slug: wanted }, select: { id: true } });
      if (product) {
        data.loanProduct = { connect: { id: product.id } };
        saved.push("loan");
      }
    }
    if (Object.keys(data).length) await this.prisma.lead.update({ where: { id: leadId }, data });

    const snap = await this.snapshot(leadId);
    const loan = loanFor(snap.loanSlug);
    if (!loan || !snap.loanSlug) return saved;
    const answers: Answers = { ...snap.answers };
    for (const a of Array.isArray(x.answers) ? x.answers : []) {
      const field = resolveField(snap.loanSlug, answers, String(a?.key ?? ""), String(a?.value ?? ""));
      if (!field || !allowed.has(field.key)) continue; // only what was actually asked
      const checked = checkAnswer(field, String(a?.value ?? ""));
      if (!checked.ok) continue;
      await this.writeAnswer(leadId, field.label, checked.value);
      answers[field.key] = checked.value;
      saved.push(field.label);
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
    return saved;
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

  private async write(turns: Turn[], plan: Plan, x: Extracted, saved: string[], snap: Snapshot, options: OptionSet | null): Promise<{ text: string; options?: Interactive } | null> {
    const company = this.settings.get<string>("org.name") || "Growth Capital Services";
    const system = `You are Gia, the WhatsApp assistant of ${company}, a loan consultant (a DSA) in Mumbai that helps people compare loan options from 75+ banks and NBFCs, free of charge to the customer. You are NOT the lender. You sound like a friendly, capable person from a good financial firm: warm, clear, respectful, never pushy.

How to write
- You are writing ONE WhatsApp message. Short and easy to read on a phone: 1 to 3 short sentences. No bullet lists, no bold, no headings. At most one emoji, and only in a greeting.
- Begin with a very short acknowledgement (a few words) when they have just answered. Do NOT repeat their answers back or say what you saved.
- Ask ONLY what your task says. Never invent questions, and never mention keys, tools, forms or "saving".
- Never promise anything about rates, approval, amounts or timelines: say it depends on the bank or NBFC and their profile, and an expert will confirm.
- Never ask for an OTP, password, PIN, card number, bank account number, Aadhaar or PAN. If they sent one, kindly tell them not to share it here: our expert will collect documents safely.
- Only loans and our services. For anything else, politely say you can only help with loans.

LANGUAGE AND STYLE: write in the language the customer TYPED, not the language of their taps. English is the default, and "hi" or "hello" is English. Never mix languages in one message.
- English: warm, professional, simple words.
- Hinglish (Hindi in English letters, e.g. "mujhe home loan chahiye"): reply fully in Hinglish, respectful "aap" (aapka, aapko, kijiye), with everyday English words for loan, amount, income and city. Example: "Namaste! Main Gia hoon, Growth Capital Services se. Aapko kaunsa loan chahiye?"
- Hindi in Devanagari: reply in Devanagari, polite "आप". Example: "नमस्ते! मैं गिया हूँ, ग्रोथ कैपिटल सर्विसेज़ से। आपको कौन-सा लोन चाहिए?"
- Marathi in Devanagari: reply in Marathi, polite "तुम्ही / तुमचे". Example: "नमस्कार! मी गिया, ग्रोथ कॅपिटल सर्विसेसमधून. तुम्हाला कोणते कर्ज हवे आहे?"`;

    const known = [snap.lead && !GENERIC_NAME.test(snap.lead.name) ? `name ${snap.lead.name}` : null, snap.lead?.city ? `city ${snap.lead.city}` : null, snap.loanName ? `loan ${snap.loanName}` : null].filter(Boolean).join(", ");
    const lines: string[] = [`LANGUAGE FOR THIS MESSAGE (decided from what the customer typed): ${LANGUAGE_NAME[detectLanguage(turns)]}. Write the whole message, and any option titles, in it. Do not drift into another language, including in a thank-you or goodbye.`];
    if (turns.filter((t) => t.role === "assistant").length === 0) {
      lines.push(
        "This is the customer's first message, so this is your WELCOME. In two or three short sentences: greet them warmly (one emoji is fine, for example a folded-hands or a wave), say you are Gia from the company, that you help compare loan offers from 75+ banks and NBFCs at no cost to them, and then ask your first question.",
      );
    }
    if (x.shared_private_number) lines.push("They sent a private number (it was hidden from you). Tell them kindly not to share such numbers here.");
    if (x.their_question) lines.push(`They asked: "${x.their_question}". Answer in one or two safe sentences (no promises), then continue.`);
    if (!saved.length && plan.kind === "ask" && !x.typing && turns.filter((t) => t.role === "assistant").length > 0) lines.push("They did not answer the last question. Ask it again in simpler words.");
    if (x.typing === "loan") lines.push("They chose to type which loan they need. Ask them to type it in their own words.");
    if (x.typing === "amount") lines.push("They chose to type the amount. Ask them to type about how much they need, for example 25 lakh.");

    if (plan.kind === "ask") {
      lines.push(
        `Ask exactly this (at most two questions in the message):\n${plan.ask
          .map((a, i) => `${i + 1}. ${a.question}${!options && a.choices ? ` [choices: ${a.choices.join(" | ")}]` : ""}${a.help ? ` (${a.help})` : ""}`)
          .join("\n")}`,
      );
      if (options) lines.push("The customer will tap one of the options listed below the message, so do NOT list the options in your message; just ask the question.");
    } else if (plan.kind === "wrap") {
      lines.push("You have what is needed. Thank them warmly and say an expert from our team will contact them soon and will go through anything else. Do not ask any more questions. If one of your earlier messages already said an expert will contact them, do NOT say it again: reply with one short friendly closing line only (such as you are welcome).");
    } else {
      lines.push("They want a person. Say a team member will message them here soon. Do not ask any questions.");
    }

    const messages: Chat[] = [{ role: "system", content: system }, ...turns];
    if (!options) {
      messages.push({ role: "system", content: `TASK for your next message. Already known about the customer: ${known || "nothing yet"}.\n${lines.join("\n")}` });
      const text = await this.complete(messages, { maxTokens: 350, temperature: 0.5 });
      return text ? { text: text.trim() } : null;
    }

    // a tap-to-choose message: the AI words the question and translates the labels of the choices
    const limit = options.titleLimit;
    lines.push(
      `Reply as ONE JSON object: {"body": "<your message>", "option_titles": [<one title per option, same order>], "menu_label": "<a word for the list button, at most 20 characters, such as Choose>"}.\nThe options, in order:\n${options.choices.map((c, i) => `${i + 1}. ${c.english}`).join("\n")}\nWrite each option title in the language of your message, AT MOST ${limit} characters, no emoji. If an option is longer than that, REWRITE it shorter with the same meaning (for example "Ready-to-move flat or house" becomes "Ready flat / house"); never cut a word off. Loan names such as "Home Loan" may stay in English. Keep money figures as they are.`,
    );
    messages.push({ role: "system", content: `TASK for your next message. Already known about the customer: ${known || "nothing yet"}.\n${lines.join("\n")}` });
    const raw = await this.complete(messages, { json: true, maxTokens: 500, temperature: 0.5 });
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
    const rows = options.choices.map((c, i) => ({ id: c.id, title: shorten(titles.length === options.choices.length && titles[i] ? titles[i]! : c.english, limit) }));
    const content: Interactive =
      options.kind === "buttons"
        ? { kind: "buttons", body, buttons: rows }
        : { kind: "list", body, button: menu, rows };
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
