import { Injectable, NotFoundException } from "@nestjs/common";
import { EmploymentType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProfileAiService } from "./profile-ai.service";
import {
  PROFILE_STAGE,
  answerKey,
  fieldsFor,
  format,
  nextField,
  parseAnswer,
  progress,
  renderQuestion,
  summarise,
  totalEmi,
  type Answers,
  type Field,
} from "./profile-schema";

export type StepResult = {
  /** True when the reply was understood and stored. */
  accepted: boolean;
  /** What was stored (the allowed value), when accepted. */
  stored?: string;
  /** Text to send next: the next question, a gentle re-ask, or the closing message. */
  reply: string;
  nextKey: string | null;
  progress: { done: number; total: number; complete: boolean };
};

const label = (f: Field) => `Loan profile ${f.num} · ${f.label}`;

/**
 * One interview, many channels. WhatsApp, the AI telecaller, Gia and staff all call step(): it reads the reply
 * against the current question, stores the allowed value, and hands back the next question.
 */
@Injectable()
export class LoanProfileService {
  constructor(
    private prisma: PrismaService,
    private ai: ProfileAiService,
  ) {}

  async answers(leadId: string): Promise<Answers> {
    const rows = await this.prisma.leadAnswer.findMany({ where: { leadId, key: { startsWith: "lp-" } }, select: { key: true, value: true } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async view(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) throw new NotFoundException("Lead not found");
    const a = await this.answers(leadId);
    const next = nextField(a);
    return {
      progress: progress(a),
      next: next ? { key: next.id, num: next.num, label: next.label, kind: next.kind, options: next.options ?? null, question: renderQuestion(next) } : null,
      answers: summarise(a),
      totalMonthlyEmi: totalEmi(a),
    };
  }

  /** The next question, worded by the AI when it is set up. */
  async question(leadId: string, firstName: string | null, opts: { reword?: boolean; lastAnswer?: string } = {}) {
    const a = await this.answers(leadId);
    const next = nextField(a);
    if (!next) return null;
    const wording = opts.reword === false ? undefined : await this.ai.reword(next, firstName, opts.lastAnswer);
    return { key: next.id, text: renderQuestion(next, wording), field: next };
  }

  /**
   * Reads a reply for the question being asked (the next unanswered one, or `key` if the channel names it).
   * Replies that cannot be read are not stored; the same question is asked again.
   */
  async step(leadId: string, reply: string, opts: { key?: string; firstName?: string | null; reword?: boolean } = {}): Promise<StepResult> {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) throw new NotFoundException("Lead not found");
    let a = await this.answers(leadId);
    const field = opts.key ? fieldsFor(a).find((f) => f.id === opts.key) : nextField(a);
    if (!field) return { accepted: false, reply: "Thank you — we already have everything we need.", nextKey: null, progress: progress(a) };

    let parsed = parseAnswer(field, reply);
    // A loosely written reply: let the AI suggest which allowed answer it means, then check it the same way.
    if (!parsed.ok && field.kind !== "text") {
      const guess = await this.ai.interpret(field, reply);
      if (guess) parsed = parseAnswer(field, guess);
    }
    if (!parsed.ok) {
      const why = parsed.reason === "empty" ? "" : `${parsed.reason}\n\n`;
      return { accepted: false, reply: `${why}${renderQuestion(field)}`, nextKey: field.id, progress: progress(a) };
    }

    await this.prisma.leadAnswer.upsert({
      where: { leadId_key: { leadId, key: answerKey(field.id) } },
      create: { leadId, stage: PROFILE_STAGE, key: answerKey(field.id), label: label(field), value: parsed.value },
      update: { stage: PROFILE_STAGE, label: label(field), value: parsed.value },
    });
    a = { ...a, [answerKey(field.id)]: parsed.value };
    await this.after(leadId, field, parsed.value, a);

    const next = nextField(a);
    const p = progress(a);
    if (!next) {
      return { accepted: true, stored: parsed.value, reply: "That's everything we need for the preliminary assessment. Thank you! Our expert will study your profile and get back to you shortly.", nextKey: null, progress: p };
    }
    const wording = opts.reword === false ? undefined : await this.ai.reword(next, opts.firstName ?? null, format(field, parsed.value));
    return { accepted: true, stored: parsed.value, reply: renderQuestion(next, wording), nextKey: next.id, progress: p };
  }

  /** Answers that also belong on the lead itself, and the running total of EMIs. */
  private async after(leadId: string, field: Field, value: string, a: Answers) {
    const lead: { amount?: number; employmentType?: EmploymentType; monthlyIncome?: number } = {};
    if (field.id === "loan-amount") lead.amount = Number(value);
    if (field.id === "profile") lead.employmentType = value === "Salaried" ? EmploymentType.SALARIED : EmploymentType.BUSINESS;
    if (field.id === "sal-net") lead.monthlyIncome = Number(value);
    if (Object.keys(lead).length) {
      const cur = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { amount: true, employmentType: true, monthlyIncome: true } });
      // What staff have already set is left alone.
      await this.prisma.lead.update({
        where: { id: leadId },
        data: {
          ...(lead.amount && !cur?.amount && { amount: lead.amount }),
          ...(lead.employmentType && !cur?.employmentType && { employmentType: lead.employmentType }),
          ...(lead.monthlyIncome && !cur?.monthlyIncome && { monthlyIncome: lead.monthlyIncome }),
        },
      });
    }
    if (/^loan-\d+-emi$/.test(field.id)) {
      const total = totalEmi(a);
      await this.prisma.leadAnswer.upsert({
        where: { leadId_key: { leadId, key: "lp-total-emi" } },
        create: { leadId, stage: PROFILE_STAGE, key: "lp-total-emi", label: "Loan profile 8.10 · Total monthly EMI / obligations", value: String(total) },
        update: { value: String(total) },
      });
    }
  }
}
