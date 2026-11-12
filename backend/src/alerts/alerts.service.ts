import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { MailService } from "./mail.service";
import { customerThankYou, gcsIdMessage, recoveryCode, signInCode, teamAlert, type Org } from "./email-templates";

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

/** Tells staff about a new website enquiry, and thanks the person who sent it. All mail goes through Zoho. */
@Injectable()
export class AlertsService {
  constructor(
    private mail: MailService,
    private settings: SettingsService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** The company's details for the email frame, from Settings -> Organisation. */
  private org(): Org {
    return {
      name: this.settings.get<string>("org.name"),
      address: this.settings.get<string>("org.address"),
      phone: this.settings.get<string>("org.phone"),
      whatsapp: this.settings.get<string>("org.whatsapp"),
      email: this.settings.get<string>("org.email"),
      // The logo in each email is loaded from the website.
      websiteUrl: (this.config.get<string>("WEBSITE_URL") || "https://gcs-website.jonathannnn3009.workers.dev").replace(/\/+$/, ""),
    };
  }

  /** The sign-in code for the website chat. Returns whether Zoho took it. */
  signInCodeEmail(to: string, name: string, code: string, validMinutes: number) {
    const first = name.split(/\s+/)[0] || "there";
    return this.mail.send({
      to,
      subject: `Your Growth Capital Services code: ${code}`,
      html: signInCode(this.org(), first, code, validMinutes),
    });
  }

  /** The code that confirms a mobile number before a GCS ID is sent, emailed when there is no SMS. */
  idRecoveryCodeEmail(to: string, code: string, validMinutes: number, kind: "client" | "partner") {
    const idName = kind === "client" ? "GCS ID" : "Partner ID";
    return this.mail.send({
      to,
      subject: `Your confirmation code: ${code}`,
      html: recoveryCode(this.org(), code, validMinutes, idName),
    });
  }

  /** The GCS ID(s) for a client or partner, emailed to the address on their file. */
  gcsIdEmail(to: string, kind: "client" | "partner", ids: string[]) {
    const idName = kind === "client" ? "GCS ID" : "Partner ID";
    return this.mail.send({
      to,
      subject: `Your ${idName} - ${this.settings.get<string>("org.name")}`,
      html: gcsIdMessage(this.org(), idName, ids),
    });
  }

  /**
   * Sends one test email, so staff can tell whether the mail account is set up. It goes to the company email in
   * Settings -> Organisation (a real mailbox), or to the signed-in person's address if that is blank.
   * Says why if it cannot send.
   */
  async sendTest(fallbackTo: string) {
    const to = this.settings.get<string>("org.email")?.trim() || fallbackTo;
    if (!this.mail.enabled) {
      return {
        configured: false,
        sent: false,
        message:
          "Email is switched off: the server is missing its Zoho mail settings (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ACCOUNT_ID, ZOHO_FROM_ADDRESS). Ask whoever runs the server to add them.",
      };
    }
    const sent = await this.mail.send({
      to,
      subject: "Test email from the CRM",
      html: teamAlert(this.org(), "Test email", [["Result", "Email is working"]], "If you can read this, the CRM can send email through Zoho.", this.org().phone, "Hello"),
    });
    return {
      configured: true,
      sent,
      message: sent
        ? `Test email sent to ${to}. Check the inbox (and spam).`
        : this.mail.lastError || "The mail settings are there but Zoho refused the email. The server log says why.",
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

    const org = this.org();
    const partnerKind = PARTNER_FORMS[lead.source];
    const staff = this.settings.get<string[]>("alerts.newLeadEmails").filter(Boolean);
    if (staff.length > 0) {
      const heading = partnerKind ? `New ${partnerKind} partner sign-up` : "New website enquiry";
      await this.mail.send({
        to: staff,
        subject: partnerKind
          ? `New partner sign-up (${partnerKind}): ${lead.name}`
          : `New enquiry #${lead.leadNo}: ${lead.name}${lead.loanType ? ` - ${lead.loanType}` : ""}`,
        html: teamAlert(
          org,
          heading,
          [
            ["Name", lead.name],
            ["Lead", `#${lead.leadNo}`],
            ["Phone", lead.phone],
            ["Email", lead.email ?? ""],
            ["City", lead.city ?? ""],
            ["Loan", lead.loanType ?? ""],
            ["Amount", lead.amount ? rupees(lead.amount) : ""],
            ["Form", lead.source],
            ["Received", `${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (India time)`],
          ],
          lead.detail ?? "",
          lead.phone,
          `Hi ${lead.name}, this is ${org.name}. Thanks for your ${partnerKind ? "interest in partnering with us" : `enquiry${lead.loanType ? ` about a ${lead.loanType}` : ""}`}. When is a good time to talk?`,
        ),
      });
    }

    if (lead.email && this.settings.get<boolean>("alerts.customerAutoReply")) {
      const first = lead.name.split(" ")[0] ?? lead.name;
      const body = this.settings
        .get<string>("alerts.autoReplyMessage")
        .replaceAll("{name}", first)
        .replaceAll("{org}", org.name)
        .replaceAll("{phone}", org.phone);
      await this.mail.send({
        to: lead.email,
        subject: `We received your enquiry - ${org.name}`,
        html: customerThankYou(org, first, body),
      });
    }
  }
}
