import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LeadsService } from "../leads/leads.service";
import { loanSlug, readCall, type CallDetails } from "./voice-payload";
import { caLegalIntent } from "../whatsapp/ca-legal";
import { EventsService } from "../events/events.service";

/** The CA or legal services a call was about: what the agent reported, or else what its own words say. */
export function caLegalOf(c: CallDetails): { services: string[]; need: string | null } | null {
  const x = c.extra;
  const wanted = x.serviceInterest === "ca_legal" || x.serviceInterest === "both";
  const said = [x.caLegalService, x.caLegalNeed, c.summary].filter(Boolean).join(". ");
  const found = caLegalIntent(said)?.categories ?? [];
  if (!wanted && !found.length) return null;
  const services = found.length ? found : x.caLegalService ? [x.caLegalService] : ["CA & Legal"];
  return { services, need: x.caLegalNeed ?? x.caLegalService ?? null };
}

/** Why a call needs a person to ring back, or null when nothing is owed (not interested, do not call, wrong number). */
export function followUpReason(c: CallDetails): "human-callback" | "callback-later" | "ca-legal" | "details-collected" | null {
  const x = c.extra;
  if (x.doNotCall) return null;
  const o = x.outcome ?? "";
  if (o === "not_interested" || o === "wrong_number") return null;
  if (x.humanCallback) return "human-callback";
  if (x.callbackTime || o === "callback_later") return "callback-later";
  if (caLegalOf(c)) return "ca-legal";
  return "details-collected";
}

export const VOICE_SOURCE = "ai-telecaller";

export type VoiceOutcome = "LEAD_CREATED" | "LEAD_UPDATED" | "NO_LEAD" | "ERROR" | "DUPLICATE";

/** What the lead's notes say about the call: the agent's own summary first, then what it picked up. */
export function callNote(c: CallDetails, when = new Date()): string {
  // The person's own name comes first: everything below is about them.
  const lines = c.name ? [`Name given on the call: ${c.name}`] : [];
  lines.push(`AI phone call, ${when.toISOString().slice(0, 16).replace("T", " ")} UTC${c.durationSec ? `, ${c.durationSec}s` : ""}.`);
  if (c.summary) lines.push(c.summary);
  if (c.loanType) lines.push(`Loan type: ${c.loanType}`);
  if (c.amount) lines.push(`Amount: ${c.amount}`);
  const x = c.extra;
  if (x.doNotCall) lines.push("DO NOT CALL: the person asked not to be called again.");
  if (x.humanCallback) lines.push("CALL BACK: the person asked for a team member to call.");
  if (x.callbackTime) lines.push(`Best time to call: ${x.callbackTime}`);
  if (x.workPhone && x.workPhone !== c.phone) lines.push(`Work number given: ${x.workPhone}`);
  if (x.callbackNumber && x.callbackNumber !== c.phone) lines.push(`CALL BACK ON ${x.callbackNumber} (the number they asked for; they called from ${c.phone ?? "another number"})`);
  const legal = caLegalOf(c);
  if (legal) lines.push(`CA & LEGAL: the caller asked about ${legal.services.join(", ")}${legal.need ? ` (${legal.need})` : ""}. For the CA and legal team to call back.`);
  const more: [string, unknown][] = [
    ["Works as", x.employmentType?.replace("_", "-").toLowerCase()], ["Monthly income", x.monthlyIncome], ["Employer", x.employer], ["Years in job", x.yearsInJob], ["Total experience", x.totalExperience],
    ["Business", x.businessType], ["Years in business", x.businessYears], ["Yearly turnover", x.annualTurnover],
    ["EMIs now (per month)", x.existingEmi], ["CIBIL (as told)", x.cibil], ["Age / birth year", x.ageOrBirthYear],
    ["Property", x.propertyType], ["Property value", x.propertyValue], ["Loan on property", x.propertyHasLoan], ["Co-applicant", x.coApplicant],
  ];
  const told = more.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}: ${v}`);
  if (told.length) lines.push(told.join("; "));
  return lines.join("\n").slice(0, 2000);
}

/**
 * Takes the voice agent's end-of-call message, keeps it as received, and turns a connected call from a real
 * mobile number into a lead (or adds to the one that number already has).
 */
@Injectable()
export class VoiceService {
  private readonly log = new Logger("VoiceCalls");

  constructor(
    private prisma: PrismaService,
    private leads: LeadsService,
    private events?: EventsService,
  ) {}

  /** Puts what the agent learnt into the lead's own fields, but only where the lead has nothing yet: staff's entries stay. */
  private async fillBlanks(leadId: string, c: CallDetails) {
    try {
      const x = c.extra;
      const now = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { phone: true, secondaryPhone: true, email: true, employmentType: true, monthlyIncome: true, employerName: true, experienceYears: true, currentExperienceYears: true } });
      if (!now) return;
      const data: Prisma.LeadUpdateInput = {};
      if (!now.email && x.email) data.email = x.email;
      // A separate work number, or a number they asked to be called on, is registered as the lead's second number. The number
      // they called from stays the main one unless staff change it, and a number staff entered is never replaced.
      const other = [x.workPhone, x.callbackNumber].find((n) => n && n !== now.phone && n !== c.phone);
      if (!now.secondaryPhone && other) data.secondaryPhone = other;
      if (!now.employmentType && x.employmentType) data.employmentType = x.employmentType;
      if (!now.monthlyIncome && x.monthlyIncome && x.monthlyIncome < 1e8) data.monthlyIncome = x.monthlyIncome;
      if (!now.employerName && x.employer) data.employerName = x.employer;
      // Years in the current job are the current experience; total experience is only set when the caller gave it.
      if (!now.currentExperienceYears && x.yearsInJob && x.yearsInJob < 80) data.currentExperienceYears = x.yearsInJob;
      if (!now.experienceYears && x.totalExperience && x.totalExperience < 80) data.experienceYears = x.totalExperience;
      if (Object.keys(data).length) await this.prisma.lead.update({ where: { id: leadId }, data });
    } catch (err) {
      this.log.warn(`Could not fill lead fields from a call: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  /** A CA or legal enquiry on a call is kept on the lead the same way as one on WhatsApp, so staff see it in one place. */
  private async saveCaLegal(leadId: string, c: CallDetails) {
    const legal = caLegalOf(c);
    if (!legal) return;
    try {
      const put = (key: string, label: string, value: string) =>
        this.prisma.leadAnswer.upsert({
          where: { leadId_key: { leadId, key } },
          create: { leadId, stage: "ai-telecaller-ca-legal", key, label, value: value.slice(0, 500) },
          update: { stage: "ai-telecaller-ca-legal", label, value: value.slice(0, 500) },
        });
      await put("ca-legal-service", "CA & Legal service asked about", legal.services.join(", "));
      if (legal.need) await put("ca-legal-need", "What they need (CA & Legal)", legal.need);
      await put("ca-legal-request", "CA & Legal request", "Asked on a phone call: for the CA and legal team to call");
    } catch (err) {
      this.log.warn(`Could not keep the CA & Legal details from a call: ${(err as Error).message.slice(0, 200)}`);
    }
  }

  async accept(payload: unknown): Promise<{ outcome: VoiceOutcome; leadId?: string }> {
    const call = readCall(payload);

    if (call.callId && (await this.prisma.voiceCall.findUnique({ where: { callId: call.callId }, select: { id: true } }))) {
      return { outcome: "DUPLICATE" };
    }

    let outcome: VoiceOutcome = "NO_LEAD";
    let leadId: string | undefined;
    let error: string | undefined;

    if (call.connected && call.phone) {
      try {
        const lead = await this.leads.intake({
          name: call.name && call.name.length >= 2 ? call.name : "Phone enquiry",
          phone: call.phone,
          city: call.city && call.city.length >= 2 ? call.city : undefined,
          amount: call.amount ?? undefined,
          productSlug: loanSlug(call.loanType, call.summary) ?? undefined,
          source: VOICE_SOURCE,
          detail: callNote(call),
        } as never);
        leadId = lead.id;
        await this.fillBlanks(lead.id, call);
        await this.saveCaLegal(lead.id, call);
        outcome = "isNew" in lead && lead.isNew ? "LEAD_CREATED" : "LEAD_UPDATED";
        const why = followUpReason(call);
        if (why) this.events?.emit("FOLLOW_UP_NEEDED", { leadId: lead.id, why, callbackTime: call.extra.callbackTime, callbackNumber: call.extra.callbackNumber && call.extra.callbackNumber !== call.phone ? call.extra.callbackNumber : null, note: call.summary });
      } catch (err) {
        outcome = "ERROR";
        error = (err as Error).message.slice(0, 500);
        this.log.error(`Could not turn a call into a lead: ${error}`);
      }
    }

    try {
      await this.prisma.voiceCall.create({
        data: {
          callId: call.callId,
          phone: call.phone,
          status: call.status,
          durationSec: call.durationSec,
          outcome,
          leadId,
          error,
          summary: call.summary,
          transcript: call.transcript,
          payload: payload as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // The same call delivered twice at once: the other copy won.
      if ((err as { code?: string }).code === "P2002") return { outcome: "DUPLICATE", leadId };
      throw err;
    }
    return { outcome, leadId };
  }
}
