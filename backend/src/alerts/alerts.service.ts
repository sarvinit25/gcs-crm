import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { MailService } from "./mail.service";

type NewLead = {
  leadNo: number;
  name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  source: string;
  loanType?: string | null;
  amount?: string | number | null;
  detail?: string | null;
};

/** The website's partner forms, so their email reads as a sign-up and not a loan enquiry. */
const PARTNER_FORMS: Record<string, string> = {
  "partner-enquiry": "Agent",
  "partner-builder": "Builder",
  "partner-freelancer": "Freelancer",
};

const rupees = (n: string | number) => `Rs. ${Number(n).toLocaleString("en-IN")}`;

/** Tells staff about a new website enquiry, and thanks the person who sent it. */
@Injectable()
export class AlertsService {
  constructor(
    private mail: MailService,
    private settings: SettingsService,
    private prisma: PrismaService,
  ) {}

  /** Sends one test email, so staff can tell whether the mail server is set up. Says why if it is not. */
  async sendTest(to: string) {
    if (!this.mail.enabled) {
      return { configured: false, sent: false, message: "Email is switched off: the server has no SMTP_HOST set. Ask whoever runs the server to add the SMTP settings." };
    }
    const sent = await this.mail.send({
      to,
      subject: "Test email from the CRM",
      text: "This is a test. If you can read it, the CRM can send email.",
    });
    return {
      configured: true,
      sent,
      message: sent ? `Test email sent to ${to}. Check the inbox (and spam).` : "The mail server is set up but refused the email. The server log has the reason.",
    };
  }

  /** Fire and forget: call without awaiting. */
  async newLead(lead: NewLead) {
    if (!this.mail.enabled) return;

    // The website sends a product slug; staff should read the product's name.
    if (lead.loanType) {
      const product = await this.prisma.loanProduct.findUnique({
        where: { slug: lead.loanType },
        select: { name: true },
      });
      if (product) lead = { ...lead, loanType: product.name };
    }

    const staff = this.settings.get<string[]>("alerts.newLeadEmails").filter(Boolean);
    if (staff.length > 0) {
      const waText = encodeURIComponent(
        `Hi ${lead.name}, this is Growth Capital Services. Thanks for your enquiry${lead.loanType ? ` about a ${lead.loanType}` : ""}. When is a good time to talk?`,
      );
      const lines = [
        PARTNER_FORMS[lead.source] ? `New ${PARTNER_FORMS[lead.source]} partner sign-up - lead #${lead.leadNo}` : `New website enquiry - lead #${lead.leadNo}`,
        "",
        `Name:    ${lead.name}`,
        `Phone:   ${lead.phone}`,
        lead.email ? `Email:   ${lead.email}` : "",
        lead.city ? `City:    ${lead.city}` : "",
        lead.loanType ? `Loan:    ${lead.loanType}` : "",
        lead.amount ? `Amount:  ${rupees(lead.amount)}` : "",
        `Form:    ${lead.source}`,
        lead.detail ? `\nDetails: ${lead.detail}` : "",
        "",
        `Call:      tel:+91${lead.phone}`,
        `WhatsApp:  https://wa.me/91${lead.phone}?text=${waText}`,
      ].filter((l) => l !== "");
      await this.mail.send({
        to: staff,
        subject: PARTNER_FORMS[lead.source]
          ? `New partner sign-up (${PARTNER_FORMS[lead.source]}): ${lead.name}`
          : `New enquiry #${lead.leadNo}: ${lead.name}${lead.loanType ? ` - ${lead.loanType}` : ""}`,
        text: lines.join("\n"),
        ...(lead.email ? { replyTo: lead.email } : {}),
      });
    }

    if (lead.email && this.settings.get<boolean>("alerts.customerAutoReply")) {
      const org = this.settings.get<string>("org.name");
      const phone = this.settings.get<string>("org.phone");
      const body = this.settings
        .get<string>("alerts.autoReplyMessage")
        .replaceAll("{name}", lead.name.split(" ")[0] ?? lead.name)
        .replaceAll("{org}", org)
        .replaceAll("{phone}", phone);
      await this.mail.send({
        to: lead.email,
        subject: `We received your enquiry - ${org}`,
        text: body,
      });
    }
  }
}
