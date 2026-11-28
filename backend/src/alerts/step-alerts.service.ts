import { Injectable, OnModuleInit } from "@nestjs/common";
import { EventsService } from "../events/events.service";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { checklistUrl } from "../whatsapp/intake/intake.engine";
import { AlertsService } from "./alerts.service";

const rupees = (n: unknown) => `Rs. ${Number(n ?? 0).toLocaleString("en-IN")}`;
const words = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/**
 * Listens to what happens on a file and emails the team one short note per step. It only reads; a mail problem is
 * logged and never touches the save that caused it. Money is never put in an email except the size of the loan.
 */
@Injectable()
export class StepAlertsService implements OnModuleInit {
  constructor(
    private events: EventsService,
    private prisma: PrismaService,
    private settings: SettingsService,
    private alerts: AlertsService,
  ) {}

  onModuleInit() {
    const on = (name: string, fn: (p: Record<string, unknown>) => Promise<void>) => this.events.on(name, fn);
    on("APPLICATION_CREATED", (p) => this.application("converted", "An application was started", String(p.applicationId)));
    on("FILE_STAGE_CHANGED", (p) => this.application("stage", null, String(p.applicationId)));
    on("FILE_REJECTED", (p) => this.application("rejected", "A file was rejected", String(p.applicationId)));
    on("SANCTION_APPROVED", (p) => this.application("sanction", "A sanction was approved", String(p.applicationId)));
    on("DISBURSAL_COMPLETED", (p) => this.disbursal(String(p.applicationId), String(p.disbursementId)));
    on("CAM_SUBMITTED", (p) => this.cam(String(p.leadId)));
    on("CIBIL_CHECKED", (p) => this.cibil(String(p.applicantId), String(p.how ?? ""), (p.score as number | null) ?? null));
    on("COMMISSION_CREATED", (p) => this.commission("commission", String(p.commissionId)));
    on("COMMISSION_STATUS", (p) => this.commission("commissionPaid", String(p.commissionId)));
    on("FOLLOW_UP_NEEDED", (p) => this.followUp(p));
  }

  private async followUp(p: Record<string, unknown>) {
    const l = await this.prisma.lead.findUnique({ where: { id: String(p.leadId) }, select: { id: true, leadNo: true, name: true, phone: true, secondaryPhone: true, city: true, amount: true, loanProduct: { select: { slug: true } }, assignedOfficer: { select: { name: true, email: true } } } });
    if (!l) return;
    const why = String(p.why ?? "");
    const reason: Record<string, string> = {
      "human-callback": "The caller asked for a team member to call back",
      "whatsapp-human": "The customer needs a team member on WhatsApp (they asked for a person, or the assistant could not help)",
      "callback-later": "The caller asked to be called at another time",
      "ca-legal": "The caller asked about CA or legal services",
      "details-collected": "The phone assistant took the details; a team member should call to take it forward",
      "follow-up": "A follow-up was logged in the CRM",
      "documents-pending": "The lead is waiting for documents and nothing has moved for a few days",
    };
    const when = p.dueAt ? new Date(String(p.dueAt)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " (India time)" : String(p.callbackTime ?? "");
    const rows: [string, string][] = [
      ["Why", reason[why] ?? "A follow-up is needed"],
      ["Call back", when],
      ["Customer", l.name],
      ["Phone", l.phone ?? ""],
      ...(l.secondaryPhone ? ([["Second number (work)", l.secondaryPhone]] as [string, string][]) : []),
      ...(p.callbackNumber ? ([["Call back on", String(p.callbackNumber)]] as [string, string][]) : []),
      ["City", l.city ?? ""],
      ["Loan size", l.amount ? rupees(l.amount) : ""],
      ["Note", String(p.note ?? "").slice(0, 400)],
      ["Logged by", String(p.by ?? "")],
      ["Handled by", l.assignedOfficer?.name ?? "Not assigned"],
      ...(why === "documents-pending" ? ([["Document checklist to send", checklistUrl(process.env.PUBLIC_SITE_URL?.trim() || "https://growthcapitalservices.in", l.loanProduct?.slug, null) ?? ""]] as [string, string][]) : []),
    ];
    await this.alerts.stepChanged("followUp", `Follow-up needed: ${l.name} (lead #${l.leadNo})`, rows, `/leads/${l.id}`, { alsoTo: l.assignedOfficer?.email ? [l.assignedOfficer.email] : [], button: "Open the lead" });
  }

  private async file(applicationId: string) {
    return this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true, seq: true, createdAt: true, status: true, requestedAmount: true,
        loanProduct: { select: { name: true } }, lender: { select: { name: true } }, owner: { select: { name: true, email: true } },
        applicants: { where: { isPrimary: true }, take: 1, select: { name: true } },
      },
    });
  }

  private rows(a: NonNullable<Awaited<ReturnType<StepAlertsService["file"]>>>): [string, string][] {
    return [
      ["File", this.settings.applicationNo(a.seq, a.createdAt)],
      ["Customer", a.applicants[0]?.name ?? ""],
      ["Loan", a.loanProduct.name],
      ["Lender", a.lender?.name ?? ""],
      ["Loan size", rupees(a.requestedAmount)],
      ["Stage now", words(a.status)],
      ["Handled by", a.owner?.name ?? "Not assigned"],
    ];
  }

  private async application(step: "converted" | "stage" | "rejected" | "sanction", headline: string | null, applicationId: string) {
    const a = await this.file(applicationId);
    if (!a) return;
    const no = this.settings.applicationNo(a.seq, a.createdAt);
    const title = headline ? `${headline}: ${no}` : `${no} moved to ${words(a.status)}`;
    await this.alerts.stepChanged(step, title, this.rows(a), `/applications/${a.id}`, { alsoTo: a.owner?.email ? [a.owner.email] : [], button: "Open the file" });
  }

  private async disbursal(applicationId: string, disbursementId: string) {
    const [a, d] = await Promise.all([this.file(applicationId), this.prisma.disbursement.findUnique({ where: { id: disbursementId }, select: { amount: true } })]);
    if (!a) return;
    const rows = this.rows(a);
    rows.push(["Paid out", rupees(d?.amount)], ["Next", "Record the commission for this payout under Commissions"]);
    await this.alerts.stepChanged("disbursal", `Disbursement recorded: ${this.settings.applicationNo(a.seq, a.createdAt)}`, rows, `/applications/${a.id}`, { alsoTo: a.owner?.email ? [a.owner.email] : [], button: "Open the file" });
  }

  private async cam(leadId: string) {
    const l = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, leadNo: true, name: true, phone: true, assignedOfficer: { select: { name: true, email: true } } } });
    if (!l) return;
    await this.alerts.stepChanged("cam", `CAM submitted by ${l.name} (lead #${l.leadNo})`, [["Lead", `#${l.leadNo}`], ["Customer", l.name], ["Phone", l.phone ?? ""], ["Handled by", l.assignedOfficer?.name ?? "Not assigned"]], `/leads/${l.id}/cam`, { alsoTo: l.assignedOfficer?.email ? [l.assignedOfficer.email] : [], button: "Review the CAM" });
  }

  private async cibil(applicantId: string, how: string, score: number | null) {
    const ap = await this.prisma.applicant.findUnique({ where: { id: applicantId }, select: { name: true, applicationId: true } });
    if (!ap) return;
    const a = await this.file(ap.applicationId);
    if (!a) return;
    const rows = this.rows(a);
    rows.unshift(["Applicant", ap.name], ["Score", score === null ? "No score returned" : String(score)], ["How", how === "MANUAL" ? "Typed in from a report" : how === "SIMULATED" ? "Test run (not a real score)" : "Pulled from the bureau"]);
    await this.alerts.stepChanged("cibil", `CIBIL checked for ${ap.name} (${this.settings.applicationNo(a.seq, a.createdAt)})`, rows, "/cibil", { alsoTo: a.owner?.email ? [a.owner.email] : [], button: "Open CIBIL" });
  }

  private async commission(step: "commission" | "commissionPaid", commissionId: string) {
    const c = await this.prisma.commission.findUnique({ where: { id: commissionId }, select: { status: true, disbursement: { select: { applicationId: true } } } });
    if (!c) return;
    const a = await this.file(c.disbursement.applicationId);
    if (!a) return;
    const no = this.settings.applicationNo(a.seq, a.createdAt);
    // Commission economics are for admins and managers: no amounts, and not copied to the file's owner.
    await this.alerts.stepChanged(step, step === "commission" ? `Commission created for ${no}` : `Commission ${words(c.status)} for ${no}`, [["File", no], ["Customer", a.applicants[0]?.name ?? ""], ["Lender", a.lender?.name ?? ""], ["Commission status", words(c.status)]], "/commissions", { button: "Open Commissions" });
  }
}
