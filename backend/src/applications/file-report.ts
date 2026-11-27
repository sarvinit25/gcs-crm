// The report on one loan file: how it moved from enquiry to disbursal, and everything recorded on it. Commission and other
// internal money is left out, because this report is often passed on with the file.
import type { Block } from "./simple-pdf";

type Money = unknown;
type Day = Date | null | undefined;

export type ReportData = {
  company: { name: string; phone?: string; email?: string };
  applicationNo: string;
  generatedBy: string;
  generatedAt: Date;
  app: {
    status: string;
    requestedAmount: Money;
    tenureMonths: number | null;
    purpose: string | null;
    createdAt: Date;
    bankLoginAt: Day;
    bankReferenceNo: string | null;
    bankerName: string | null;
    bankerMobile: string | null;
    loginFees: Money;
    dsaChannel: string | null;
    loanProduct: { name: string };
    lender: { name: string } | null;
    owner: { name: string } | null;
    lead: { leadNo: number; createdAt: Date; source: string; notes: string | null } | null;
    applicants: (Record<string, unknown> & { name: string; isPrimary: boolean; creditChecks: { score: number | null; status: string; reportDate: Day; reference: string | null; note: string | null; createdAt: Date }[] })[];
    references: { name: string; phone: string; relation: string | null; address: string | null }[];
    existingLoans: { lenderName: string; loanType: string | null; outstanding: Money; emi: Money; monthsLeft: number | null; counted: boolean }[];
    creditEvaluation: (Record<string, unknown> & { decision: string | null }) | null;
    sanction: Record<string, unknown> | null;
    disbursements: { amount: Money; netAmount: Money; disbursedAt: Date; loanAccountNo: string | null; utrNo: string | null; processingFee: Money; note: string | null }[];
    invites: { createdAt: Date; submittedAt: Day }[];
  };
  history: { createdAt: Date; actorName: string; changes: unknown }[];
  match: { createdAt: Date; results: { lenderName: string; category?: string; score: number | null; reasons: { ok: boolean; text: string }[] }[] } | null;
  documents: { category: string; path: string; createdAt: Date }[];
  missing: string[];
};

const IST = 5.5 * 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const day = (d: unknown): string => {
  if (!(d instanceof Date)) return "";
  const t = new Date(d.getTime() + IST);
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
};
const clock = (d: Date) => `${day(d)} ${new Date(d.getTime() + IST).toISOString().slice(11, 16)}`;
export const rupees = (v: unknown): string => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? "" : `Rs ${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const words = (v: unknown) => (typeof v === "string" && v ? v.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : "");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** Only the lines that have something to say. */
const filled = (pairs: [string, string][]) => pairs.filter(([, v]) => v);

type Step = { at: Date; dated: string; what: string; by: string };

/** Everything that happened on the file, oldest first. */
export function timeline(data: Pick<ReportData, "app" | "history" | "match">): Step[] {
  const { app } = data;
  const steps: Step[] = [];
  const at = (when: Date, what: string, by = "", dated = clock(when)) => steps.push({ at: when, dated, what, by });
  if (app.lead) at(app.lead.createdAt, `Lead #${app.lead.leadNo} received (${app.lead.source})`);
  at(app.createdAt, "Application raised");
  for (const i of app.invites) {
    at(i.createdAt, "Application form link made for the customer");
    if (i.submittedAt) at(i.submittedAt, "Customer submitted the application form");
  }
  for (const a of app.applicants) for (const c of a.creditChecks) at(c.createdAt, c.status === "SUCCESS" ? `CIBIL ${c.score ?? ""} recorded for ${a.name}` : `CIBIL check failed for ${a.name}`);
  if (data.match) at(data.match.createdAt, "Lender match run");
  for (const h of data.history) {
    const status = (h.changes as { status?: { from?: string; to?: string } } | null)?.status;
    if (status?.to) at(h.createdAt, `Moved to ${words(status.to)}`, h.actorName);
  }
  // Dates written on the lender's side carry no time of day.
  if (app.bankLoginAt) at(app.bankLoginAt, `Logged in with the lender${app.bankReferenceNo ? ` (${app.bankReferenceNo})` : ""}`, "", day(app.bankLoginAt));
  const sanctioned = app.sanction?.sanctionDate;
  if (sanctioned instanceof Date) at(sanctioned, `Sanctioned ${rupees(app.sanction!.sanctionedAmount)}`, "", day(sanctioned));
  for (const d of app.disbursements) at(d.disbursedAt, `Disbursed ${rupees(d.amount)}`, "", day(d.disbursedAt));
  return steps.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function reportBlocks(data: ReportData): Block[] {
  const { app } = data;
  const out: Block[] = [
    { title: `${data.company.name}: loan file ${data.applicationNo}`, subtitle: `Prepared by ${data.generatedBy} on ${clock(data.generatedAt)} IST${data.company.phone ? ` | ${data.company.phone}` : ""}` },
    { heading: "Summary" },
    {
      pairs: filled([
        ["Applicant", app.applicants.find((a) => a.isPrimary)?.name ?? app.applicants[0]?.name ?? ""],
        ["Status", words(app.status)],
        ["Loan type", app.loanProduct.name],
        ["Amount requested", rupees(app.requestedAmount)],
        ["Tenure", app.tenureMonths ? `${app.tenureMonths} months` : ""],
        ["Purpose", str(app.purpose)],
        ["Lender", app.lender?.name ?? "Not assigned"],
        ["Handled by", app.owner?.name ?? ""],
        ["Enquiry notes", str(app.lead?.notes)],
      ]),
    },
    { heading: "Process so far" },
    { table: { head: ["Date", "What happened", "By"], widths: [24, 56, 20], rows: timeline(data).map((s) => [s.dated, s.what, s.by]) } },
  ];

  for (const a of app.applicants) {
    out.push(
      { heading: `${a.isPrimary ? "Applicant" : "Co-applicant"}: ${a.name}` },
      {
        pairs: filled([
          ["Relation", str(a.relation)],
          ["Date of birth", day(a.dateOfBirth)],
          ["Mobile", str(a.phone)],
          ["Email", str(a.email)],
          ["PAN", str(a.pan)],
          ["Aadhaar (last 4)", str(a.aadhaarLast4)],
          ["Address", [a.address, a.city, a.pincode].filter(Boolean).join(", ")],
          ["Employment", words(a.employmentType)],
          ["Business type", words(a.constitution)],
          ["Employer or business", str(a.employerName)],
          ["Monthly income", rupees(a.monthlyIncome)],
          ["CIBIL score", a.cibilScore ? `${a.cibilScore}${a.cibilScoreDate ? ` (report of ${day(a.cibilScoreDate)})` : ""}` : "Not recorded"],
        ]),
      },
    );
    const notes = a.creditChecks.filter((c) => c.note || c.reference);
    if (notes.length) out.push({ pairs: notes.map((c) => [`Credit note, ${day(c.reportDate ?? c.createdAt)}`, [c.reference, c.note].filter(Boolean).join(": ")]) });
  }

  if (app.existingLoans.length) {
    const emis = app.existingLoans.filter((l) => l.counted).reduce((s, l) => s + Number(l.emi), 0);
    out.push(
      { heading: "Running loans" },
      { table: { head: ["Lender", "Type", "Outstanding", "EMI", "Months left", "Counted"], widths: [26, 20, 18, 16, 10, 10], rows: app.existingLoans.map((l) => [l.lenderName, str(l.loanType), rupees(l.outstanding), rupees(l.emi), str(l.monthsLeft), l.counted ? "Yes" : "No"]) } },
      { pairs: [["EMIs counted", `${rupees(emis)} a month`]] },
    );
  }

  const ev = app.creditEvaluation;
  if (ev) {
    const pairs = filled([
      ["Loan amount assessed", rupees(ev.loanAmount)],
      ["Monthly income", rupees(ev.monthlyIncome)],
      ["Annual turnover", rupees(ev.annualTurnover)],
      ["Net profit", rupees(ev.netProfit)],
      ["Average monthly bank credits", rupees(ev.avgMonthlyBankCredits)],
      ["Property value", rupees(ev.propertyValue)],
      ["Remarks", str(ev.remarks)],
      ["Decision", words(ev.decision)],
      ["Decision note", str(ev.decisionNote)],
    ]);
    if (pairs.length) out.push({ heading: "Credit evaluation" }, { pairs });
  }

  if (data.match) {
    const order = data.match.results.filter((r) => r.category !== "NOT_MATCHED").slice(0, 12);
    out.push(
      { heading: `Lender match of ${day(data.match.createdAt)}` },
      { text: `${data.match.results.length} lenders checked; ${data.match.results.filter((r) => r.category === "NOT_MATCHED").length} not matched. A match is a guide and not a lender's decision.` },
      { table: { head: ["Lender", "Result", "Score", "To clear"], widths: [24, 16, 9, 51], rows: order.map((r) => [r.lenderName, words(r.category), r.score === null ? "-" : `${r.score}/100`, r.reasons.filter((x) => !x.ok).map((x) => x.text).join(" ")]) } },
    );
  }

  const login = filled([
    ["Login date", day(app.bankLoginAt)],
    ["Bank application ID", str(app.bankReferenceNo)],
    ["Banker", [app.bankerName, app.bankerMobile].filter(Boolean).join(", ")],
    ["Login fees", rupees(app.loginFees)],
    ["Channel", str(app.dsaChannel)],
  ]);
  if (login.length) out.push({ heading: "Bank login" }, { pairs: login });

  const s = app.sanction;
  if (s) {
    out.push(
      { heading: "Sanction" },
      {
        pairs: filled([
          ["Financial", words(s.financialStatus)],
          ["Technical", words(s.technicalStatus)],
          ["Legal", words(s.legalStatus)],
          ["Sanctioned amount", rupees(s.sanctionedAmount)],
          ["Interest rate", s.interestRate ? `${str(s.interestRate)}% a year` : ""],
          ["Tenure", s.tenureMonths ? `${str(s.tenureMonths)} months` : ""],
          ["EMI", rupees(s.emiAmount)],
          ["Sanction letter no", str(s.sanctionLetterNo)],
          ["Sanction date", day(s.sanctionDate)],
          ["First EMI date", day(s.firstEmiDate)],
          ["Processing fee", rupees(s.processingFee)],
          ["Notes", str(s.notes)],
        ]),
      },
    );
  }

  if (app.disbursements.length) {
    const gross = app.disbursements.reduce((n, d) => n + Number(d.amount), 0);
    const net = app.disbursements.reduce((n, d) => n + Number(d.netAmount ?? d.amount), 0);
    out.push(
      { heading: "Disbursals" },
      { table: { head: ["Date", "Amount", "Processing fee", "Net paid", "Loan account / UTR"], widths: [16, 20, 16, 20, 28], rows: app.disbursements.map((d) => [day(d.disbursedAt), rupees(d.amount), rupees(d.processingFee), rupees(d.netAmount ?? d.amount), [d.loanAccountNo, d.utrNo].filter(Boolean).join(" / ")]) } },
      { pairs: [["Total disbursed", rupees(gross)], ["Net paid", rupees(net)]] },
    );
  }

  if (app.references.length) {
    out.push({ heading: "References" }, { table: { head: ["Name", "Mobile", "Relation", "Address"], widths: [26, 18, 16, 40], rows: app.references.map((r) => [r.name, r.phone, str(r.relation), str(r.address)]) } });
  }

  out.push({ heading: `Documents (${data.documents.length})` });
  if (data.documents.length) out.push({ table: { head: ["Kind", "File in this pack", "Added"], widths: [22, 62, 16], rows: data.documents.map((d) => [d.category, d.path, day(d.createdAt)]) } });
  else out.push({ text: "No documents are on this file." });
  if (data.missing.length) out.push({ text: `Could not be added to the pack: ${data.missing.join(", ")}.` });
  return out;
}
