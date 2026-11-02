import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  NotificationRecipient,
  NotificationStatus,
  NotificationTrigger,
  WhatsAppSender,
  type NotificationTemplate,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { EventsService } from "../events/events.service";
import { formatIndianNumber } from "../common/date.util";
import { ConversationsService } from "./conversations.service";
import { ProviderError, WHATSAPP_PROVIDER, type WhatsAppProvider } from "./whatsapp.provider";
import { contactKey, toWaId } from "./phone";
import { STAGE_LABEL, orderedValues, renderTemplate } from "./templates.util";

type Person = { phone: string | null | undefined; name?: string | null };

export type Dispatch = {
  trigger: NotificationTrigger;
  values: Record<string, string>;
  customer?: Person;
  staff?: Person[];
  entityType?: string;
  entityId?: string;
  /** Set for the daily briefs so each goes out once a day. */
  dayKey?: string;
};

const rupees = (value: unknown) => `₹${formatIndianNumber(Math.round(Number(value ?? 0)))}`;

/**
 * Turns "something happened" into the right WhatsApp messages. It never throws
 * into the save that triggered it, and it writes a log row for every message,
 * sent or not — a skipped message always says why.
 */
@Injectable()
export class NotificationEngine implements OnModuleInit {
  private readonly logger = new Logger("Notifications");

  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private events: EventsService,
    private conversations: ConversationsService,
    @Inject(WHATSAPP_PROVIDER) private provider: WhatsAppProvider,
  ) {}

  onModuleInit() {
    this.events.on("LEAD_CREATED", (p) => this.onLead(String(p.leadId)));
    this.events.on("FILE_STAGE_CHANGED", (p) => this.onFile("FILE_STAGE_CHANGED", String(p.applicationId)));
    this.events.on("FILE_REJECTED", (p) => this.onFile("FILE_REJECTED", String(p.applicationId)));
    this.events.on("SANCTION_APPROVED", (p) => this.onSanction(String(p.applicationId)));
    this.events.on("DISBURSAL_COMPLETED", (p) => this.onDisbursal(String(p.applicationId), String(p.disbursementId)));
  }

  get company() {
    return this.settings.get<string>("org.name") || "Growth Capital Services";
  }

  private async onLead(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { loanProduct: { select: { name: true } }, assignedOfficer: { select: { name: true, phone: true } } },
    });
    if (!lead) return;
    await this.dispatch({
      trigger: "LEAD_CREATED",
      values: { name: lead.name, phone: lead.phone, loanType: lead.loanProduct?.name ?? "loan", source: lead.source, company: this.company },
      customer: { phone: lead.phone, name: lead.name },
      staff: [{ phone: lead.assignedOfficer?.phone, name: lead.assignedOfficer?.name }],
      entityType: "Lead",
      entityId: lead.id,
    });
  }

  private async fileContext(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        loanProduct: { select: { name: true } },
        lender: { select: { name: true } },
        owner: { select: { name: true, phone: true } },
        applicants: { where: { isPrimary: true }, take: 1, select: { name: true, phone: true } },
        sanction: { select: { sanctionedAmount: true } },
      },
    });
    if (!app) return null;
    const applicant = app.applicants[0];
    return {
      app,
      values: {
        name: applicant?.name ?? "",
        applicationNo: this.settings.applicationNo(app.seq, app.createdAt),
        stage: STAGE_LABEL[app.status] ?? app.status,
        loanType: app.loanProduct.name,
        lender: app.lender?.name ?? "the lender",
        amount: app.sanction?.sanctionedAmount != null ? rupees(app.sanction.sanctionedAmount) : "",
        company: this.company,
      },
      customer: { phone: applicant?.phone, name: applicant?.name },
      staff: [{ phone: app.owner?.phone, name: app.owner?.name }],
    };
  }

  private async onFile(trigger: "FILE_STAGE_CHANGED" | "FILE_REJECTED", applicationId: string) {
    const ctx = await this.fileContext(applicationId);
    if (!ctx) return;
    await this.dispatch({ trigger, values: ctx.values, customer: ctx.customer, staff: ctx.staff, entityType: "Application", entityId: applicationId });
  }

  private async onSanction(applicationId: string) {
    const ctx = await this.fileContext(applicationId);
    if (!ctx) return;
    await this.dispatch({ trigger: "SANCTION_APPROVED", values: ctx.values, customer: ctx.customer, staff: ctx.staff, entityType: "Application", entityId: applicationId });
  }

  private async onDisbursal(applicationId: string, disbursementId: string) {
    const [ctx, disbursement] = await Promise.all([
      this.fileContext(applicationId),
      this.prisma.disbursement.findUnique({ where: { id: disbursementId }, select: { amount: true } }),
    ]);
    if (!ctx || !disbursement) return;
    await this.dispatch({
      trigger: "DISBURSAL_COMPLETED",
      values: { ...ctx.values, amount: rupees(disbursement.amount) },
      customer: ctx.customer,
      staff: ctx.staff,
      entityType: "Application",
      entityId: applicationId,
    });
  }

  /** Sends every active template for this trigger to the people it is meant for. */
  async dispatch(d: Dispatch) {
    const templates = await this.prisma.notificationTemplate.findMany({ where: { trigger: d.trigger, active: true } });
    for (const template of templates) {
      const targets: Person[] =
        template.recipient === NotificationRecipient.CUSTOMER ? (d.customer ? [d.customer] : []) : (d.staff ?? []);
      if (!targets.length) {
        await this.log(d, template, { status: "SKIPPED", reason: template.recipient === "CUSTOMER" ? "No customer to message" : "No team member is assigned" });
        continue;
      }
      for (const target of targets) {
        try {
          await this.sendOne(d, template, target);
        } catch (err) {
          this.logger.error(`${d.trigger} to ${template.recipient} failed: ${(err as Error).message}`);
        }
      }
    }
  }

  private async sendOne(d: Dispatch, template: NotificationTemplate, target: Person) {
    const phone = contactKey(target.phone);
    const forCustomer = template.recipient === NotificationRecipient.CUSTOMER;
    const base = { toPhone: phone || null, toName: target.name ?? null };

    const skip = (reason: string) => this.log(d, template, { ...base, status: "SKIPPED", reason });
    if (!phone) return skip("No phone number on record");
    if (forCustomer && !this.settings.get<boolean>("whatsapp.customerMessagesEnabled")) {
      return skip("Customer messages are switched off in WhatsApp setup");
    }
    const isBrief = d.trigger === "MORNING_BRIEF" || d.trigger === "EVENING_BRIEF";
    // Briefs have their own switch (checked before they are composed), so the alerts switch doesn't silence them.
    if (!forCustomer && !isBrief && !this.settings.get<boolean>("whatsapp.employeeAlertsEnabled")) {
      return skip("Team alerts are switched off in WhatsApp setup");
    }
    if (!this.provider.configured) return skip("WhatsApp isn't connected");
    if (this.provider.requiresApproval && template.metaStatus !== "APPROVED") {
      return skip(`This template hasn't been approved by Meta yet (${template.metaStatus.toLowerCase().replace("_", " ")})`);
    }

    try {
      const sent = await this.provider.sendTemplate(toWaId(phone), template.code, template.language, orderedValues(template.body, d.values));
      if (forCustomer) {
        // The customer's thread in the inbox shows what they were sent.
        const conversation = await this.conversations.findOrCreate(phone, target.name);
        await this.conversations.recordOutbound({
          conversationId: conversation.id,
          sender: WhatsAppSender.SYSTEM,
          type: "template",
          body: renderTemplate(template.body, d.values),
          templateName: template.code,
          waMessageId: sent.waMessageId,
        });
      }
      await this.log(d, template, { ...base, status: "SENT", waMessageId: sent.waMessageId });
    } catch (err) {
      await this.log(d, template, {
        ...base,
        status: "FAILED",
        reason: err instanceof ProviderError ? err.message : "The message could not be sent",
      });
    }
  }

  private log(
    d: Dispatch,
    template: NotificationTemplate,
    row: { status: keyof typeof NotificationStatus; reason?: string; toPhone?: string | null; toName?: string | null; waMessageId?: string },
  ) {
    return this.prisma.notificationLog.create({
      data: {
        trigger: d.trigger,
        recipient: template.recipient,
        templateCode: template.code,
        entityType: d.entityType,
        entityId: d.entityId,
        dayKey: d.dayKey,
        ...row,
      },
    });
  }
}
