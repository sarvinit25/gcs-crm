import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, WhatsAppDirection } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import { answerKey, answersByKey, checkAnswer, loanChoices, loanFor, nextQuestions, parseMoney, resolveField, withSeeds, type Answers } from "./intake.engine";

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
};

type ConversationRef = { id: string; leadId: string | null; name: string | null };
type Snapshot = Awaited<ReturnType<IntakeService["snapshot"]>>;
type Plan = { kind: "ask"; ask: Ask[] } | { kind: "wrap" } | { kind: "handoff" };

const MAX_HISTORY = 14;
/** After this many answers on the loan's own questions the assistant wraps up: the expert asks the rest on the call. */
const ENOUGH_ANSWERS = 12;
const GENERIC_NAME = /^(whatsapp enquiry|unknown)$/i;
/** A question about rates, approval, documents or charges: only then does the reply answer one. */
const ASKS_ABOUT = /\b(rate|rates|interest|approval|approve|approved|sure|guarantee|guaranteed|eligible|eligibility|document|documents|emi|charge|charges|fee|fees|processing|how much|how long|kitna|kitne|byaj|vyaj|kab)\b|\?/i;
/** Words that mean "let me talk to a person" or "I am unhappy". The AI's own judgement is not enough to hand a chat over. */
const WANTS_PERSON = /\b(agent|human|person|real person|representative|executive|manager|call me|call back|callback|talk to|speak to|complaint|complain|fraud|cheat|cheated|useless|worst)\b|बात करनी|बात करना|कॉल करो|phone karo|call karo|baat karni|baat karna/i;

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
 * the same order, as the website's forms) and saves what is learned; the AI only does two small jobs: read the
 * customer's message for answers to the questions that were asked, and word the next message. It is switched on in
 * Settings -> WhatsApp.
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
  async reply(conversation: ConversationRef): Promise<{ text: string | null; handoff: boolean }> {
    if (!conversation.leadId) return { text: null, handoff: false };
    const leadId = conversation.leadId;
    const turns = await this.history(conversation.id);
    if (!turns.length) return { text: null, handoff: false };

    // 1. What did we ask last? Then read the customer's message for the answers.
    const before = await this.snapshot(leadId);
    const asked = this.toAsk(before);
    const extracted = await this.extract(turns, asked, before);
    if (!extracted) return { text: null, handoff: true };
    // These two are decided on the customer's LATEST message only, in code, so an old message cannot keep raising them.
    const latest = await this.prisma.whatsAppMessage.findFirst({
      where: { conversationId: conversation.id, direction: WhatsAppDirection.IN, type: "text", body: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { body: true },
    });
    const raw = latest?.body ?? "";
    extracted.shared_private_number = scrub(raw) !== raw;
    extracted.wants_person = Boolean(extracted.wants_person) && WANTS_PERSON.test(raw);
    if (!ASKS_ABOUT.test(raw)) extracted.their_question = null;
    const saved = await this.apply(leadId, extracted);

    // 2. Decide, in code, what to do next.
    const after = await this.snapshot(leadId);
    let plan: Plan;
    if (extracted.wants_person) plan = { kind: "handoff" };
    else {
      const next = this.toAsk(after);
      const finished = next.length === 0 || (after.basicsDone && Object.keys(after.answers).length >= ENOUGH_ANSWERS);
      plan = finished ? { kind: "wrap" } : { kind: "ask", ask: next };
    }
    if (process.env.WHATSAPP_AI_DEBUG) this.log.warn(`read ${JSON.stringify(extracted)} | saved ${JSON.stringify(saved)} | next ${plan.kind}`);

    // 3. Word the reply.
    const text = await this.write(turns, plan, extracted, saved, after);
    return { text, handoff: plan.kind === "handoff" };
  }

  // -- the lead as it stands ---------------------------------------------------------------------

  private async snapshot(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { name: true, city: true, amount: true, loanProduct: { select: { slug: true, name: true } }, answers: { select: { key: true, value: true } } },
    });
    const loanSlug = lead?.loanProduct?.slug ?? null;
    const answers = answersByKey(loanSlug, lead?.answers ?? []);
    const missing: string[] = [];
    if (!lead || GENERIC_NAME.test(lead.name)) missing.push("name");
    if (!lead?.city) missing.push("city");
    if (!loanSlug) missing.push("loan_slug");
    if (!lead?.amount) missing.push("loan_amount");
    return { lead, loanSlug, loanName: lead?.loanProduct?.name ?? null, answers, missing, basicsDone: missing.length === 0 };
  }

  /** What to ask next: the basics first (two at most), then the loan's own questions, two at a time. */
  private toAsk(snap: Snapshot): Ask[] {
    const basics: Record<string, Ask> = {
      name: { key: "name", question: "Their name", type: "text" },
      city: { key: "city", question: "The city they live or work in", type: "text" },
      loan_slug: { key: "loan_slug", question: "Which loan they need (any wording is fine; you will match it)", type: "text" },
      loan_amount: { key: "loan_amount", question: "How much they need, in rupees", type: "amount" },
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
      where: { conversationId, type: "text", body: { not: null } },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY,
      select: { direction: true, body: true },
    });
    return rows.reverse().map((m) => ({ role: m.direction === WhatsAppDirection.IN ? ("user" as const) : ("assistant" as const), content: scrub(m.body ?? "") }));
  }

  // -- job 1: read the customer's message ------------------------------------------------------

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
- "answers": use the exact "key" from the lists above. For a question with choices, "value" must be one of the choices, written exactly. The customer may write in Hindi, Marathi or Hinglish: translate their meaning to the matching choice. For amounts give a rupee number (40 lakh = 4000000, 2 crore = 20000000). For yes/no questions use "Yes" or "No".
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
  private async apply(leadId: string, x: Extracted) {
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
      if (!field) continue;
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

  private async write(turns: Turn[], plan: Plan, x: Extracted, saved: string[], snap: Snapshot): Promise<string | null> {
    const company = this.settings.get<string>("org.name") || "Growth Capital Services";
    const system = `You are Gia, the WhatsApp assistant of ${company}, a loan consultant (a DSA) in Mumbai that helps people compare loan options from 75+ banks and NBFCs. You are NOT the lender.

How to write
- You are writing ONE WhatsApp message to the customer. Plain, simple words. Short. At most two questions. No lists, no bullet points, no bold, no emoji walls.
- LANGUAGE: use English by default, and never mix languages inside one message. Switch only when the customer's LATEST message is clearly in another language: Hindi written in English letters ("mujhe home loan chahiye") gets a whole reply in Hinglish; Devanagari gets Devanagari (Hindi or Marathi). A message like "hi" or "hello" is English. Keep choice words recognisable.
- Start with a very short thanks or acknowledgement (a few words). Do NOT repeat their answers back or say what you saved.
- When a question has choices, give the choices in one short line so they can just pick one.
- Ask ONLY the questions in your task. Never invent other questions, and never mention keys, tools or "saving".
- Rates, eligibility, approval, amounts, timelines: never promise anything. Say it depends on the bank or NBFC and their profile, and an expert will confirm.
- Never ask for an OTP, password, PIN, card number, bank account number, Aadhaar or PAN. If they sent one, tell them kindly not to share it here: our expert will collect documents safely.
- Only loans and our services. For anything else, say politely that you can only help with loans.`;

    const known = [snap.lead && !GENERIC_NAME.test(snap.lead.name) ? `name ${snap.lead.name}` : null, snap.lead?.city ? `city ${snap.lead.city}` : null, snap.loanName ? `loan ${snap.loanName}` : null].filter(Boolean).join(", ");
    const lines: string[] = [];
    if (turns.filter((t) => t.role === "assistant").length === 0) lines.push("This is the customer's first message. Greet them and say in one short sentence that you are Gia from the company and you will note down a few details so an expert can help.");
    if (x.shared_private_number) lines.push("They sent a private number (it was hidden from you). Tell them kindly not to share such numbers here.");
    if (x.their_question) lines.push(`They asked: "${x.their_question}". Answer in one or two safe sentences (no promises), then continue.`);
    if (!saved.length && plan.kind === "ask") lines.push("They did not answer the last question. Ask it again in simpler words, maybe with an example.");
    if (plan.kind === "ask") {
      lines.push(
        `Ask exactly these (one message, at most two questions):\n${plan.ask
          .map((a, i) => `${i + 1}. ${a.question}${a.choices ? ` [choices: ${a.choices.join(" | ")}]` : ""}${a.help ? ` (${a.help})` : ""}`)
          .join("\n")}`,
      );
      if (plan.ask.some((a) => a.key === "loan_slug")) {
        lines.push(`If you ask which loan they need, you may name a few common ones (home loan, business loan, personal loan, loan against property, education loan, car loan) and say you can help with others too. Our loans: ${loanChoices().map((l) => l.title).join(", ")}.`);
      }
    } else if (plan.kind === "wrap") {
      lines.push("You have what is needed. Thank them warmly and say an expert from our team will contact them soon and will go through anything else. Do not ask any more questions.");
    } else {
      lines.push("They want a person. Say a team member will message them here soon. Do not ask any questions.");
    }
    const task = `TASK for your next message. Already known about the customer: ${known || "nothing yet"}.\n${lines.join("\n")}`;
    const text = await this.complete([{ role: "system", content: system }, ...turns, { role: "system", content: task }], { maxTokens: 350, temperature: 0.4 });
    return text ? text.trim() : null;
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
