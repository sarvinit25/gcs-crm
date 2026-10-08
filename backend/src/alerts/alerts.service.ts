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

const rupees = (n: string | number) => `Rs. ${Number(n).toLocaleString("en-IN")}`;

/** Tells staff about a new website enquiry, and thanks the person who sent it. */
@Injectable()
export class AlertsService {
  constructor(
    private mail: MailService,
    private settings: SettingsService,
    private prisma: PrismaService,
  ) {}

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
        `New website enquiry - lead #${lead.leadNo}`,
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
        subject: `New enquiry #${lead.leadNo}: ${lead.name}${lead.loanType ? ` - ${lead.loanType}` : ""}`,
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
