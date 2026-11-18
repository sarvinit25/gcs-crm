import { ArrowRight, Check, MessageCircle, Phone } from "lucide-react";
import clsx from "clsx";
import { formatAmount, formatCompact, formatDate, humanize, initials } from "../lib/format";
import { whatsappLink } from "../lib/customer-form";
import { APPLICATION_STATUS_LABEL, CONSTITUTION_LABEL, EMPLOYMENT_TYPE_LABEL, type ApplicationDetail, type ApplicationStatus } from "../lib/types";
import { ApplicationStatusBadge } from "./status-badge";

/** The usual road of a file. Rejected and Withdrawn end it early, so they are shown as a banner, not a stage. */
const STAGES: ApplicationStatus[] = ["DRAFT", "SUBMITTED", "BANK_LOGIN", "UNDER_REVIEW", "SANCTIONED", "DISBURSED"];

export function StageTracker({ status }: { status: ApplicationStatus }) {
  const ended = status === "REJECTED" || status === "WITHDRAWN";
  const at = STAGES.indexOf(status);
  return (
    <section className="card p-5" aria-label="File stage">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">Where this file is</h2>
        {ended ? (
          <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-bold", status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-bg-light text-muted")}>
            {APPLICATION_STATUS_LABEL[status]}
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-muted">
            {at + 1} / {STAGES.length} stages
          </span>
        )}
      </div>
      <ol className={clsx("grid grid-cols-3 gap-y-4 sm:grid-cols-6", ended && "opacity-40")}>
        {STAGES.map((s, i) => {
          const done = !ended && i < at;
          const current = !ended && i === at;
          return (
            <li key={s} className="relative flex flex-col items-center text-center" aria-current={current ? "step" : undefined}>
              {i > 0 && (
                <span aria-hidden className={clsx("absolute top-4 right-1/2 hidden h-0.5 w-full sm:block", done || current ? "bg-navy" : "bg-line")} />
              )}
              <span
                className={clsx(
                  "relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-[12px] font-bold",
                  done && "border-navy bg-navy text-white",
                  current && "border-gold-dark bg-gold-pale text-gold-dark ring-4 ring-gold-pale/60",
                  !done && !current && "border-line bg-white text-muted",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={clsx("mt-1.5 text-[11px] leading-tight", current ? "font-bold text-navy" : "text-muted")}>{APPLICATION_STATUS_LABEL[s]}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Who the file is for and how to reach them, then the money on it. */
export function FileSummary({ app }: { app: ApplicationDetail }) {
  const primary = app.applicants.find((a) => a.isPrimary) ?? app.applicants[0];
  const stat = (label: string, value: number | null, hint: string) => (
    <div className="px-5 py-4" key={label}>
      <p className="text-xl font-bold text-navy" title={value === null ? undefined : formatAmount(value)}>
        {value === null ? "—" : value === 0 ? "₹0" : formatCompact(value)}
      </p>
      <p className="mt-0.5 text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="sr-only">{hint}</p>
    </div>
  );
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-navy/10 text-lg font-bold text-navy">
            {initials(primary?.name ?? "?")}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy">{primary?.name ?? "No applicant yet"}</h2>
              <ApplicationStatusBadge status={app.status} />
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              {app.applicationNo}
              {app.loanProduct && ` · ${app.loanProduct.name}`} · {formatCompact(app.requestedAmount)}
            </p>
          </div>
        </div>
        {primary?.phone && (
          <div className="flex items-center gap-2">
            <a href={`tel:+91${primary.phone}`} className="btn-ghost" aria-label={`Call ${primary.phone}`}>
              <Phone className="h-4 w-4" /> Call
            </a>
            <a href={whatsappLink(primary.phone, "")} target="_blank" rel="noreferrer" className="btn-ghost" aria-label="WhatsApp">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        )}
      </div>
      <div className={clsx("grid grid-cols-2 divide-x divide-line/70 border-t border-line/70", app.summary.commissionAmount === null ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
        {stat("Requested", Number(app.requestedAmount), "Amount asked for")}
        {stat("Sanctioned", app.summary.sanctionedAmount, "Amount the lender sanctioned")}
        {stat("Disbursed", app.summary.disbursedAmount, "Amount paid out so far")}
        {app.summary.commissionAmount !== null && stat("Commission", app.summary.commissionAmount, "What the lender pays us")}
      </div>
    </section>
  );
}

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** The one thing to do next on this file, as a single clear button. Moving to another stage is still possible from the menu at the top. */
export function NextStepBar({ app, busy, onMove }: { app: ApplicationDetail; busy: boolean; onMove: (status: ApplicationStatus, label: string) => void }) {
  const steps: Partial<Record<ApplicationStatus, { text: string; label: string; act: () => void }>> = {
    DRAFT: { text: "The customer has been sent the form, or you have filled it in. When the details are complete, submit the application.", label: "Submit application", act: () => onMove("SUBMITTED", "Submit this application?") },
    SUBMITTED: { text: "Next: log the file in at the lender, and record the login date, the bank's application ID and the banker.", label: "Record bank login", act: () => go("login") },
    BANK_LOGIN: { text: "The file is with the lender. When they start assessing it, move it to Under review.", label: "Mark under review", act: () => onMove("UNDER_REVIEW", "Move this file to Under review?") },
    UNDER_REVIEW: { text: "Waiting for the lender's decision. Record the sanction when it comes.", label: "Record sanction", act: () => go("sanction") },
    SANCTIONED: { text: "Sanctioned. Record each payout as the lender releases money.", label: "Record disbursement", act: () => go("disbursement") },
  };
  const step = steps[app.status];
  if (!step) return null;
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 border-gold-dark/30 bg-gold-pale/40 p-4">
      <div>
        <p className="text-[11px] font-bold tracking-wide text-gold-dark uppercase">Next step</p>
        <p className="mt-0.5 max-w-2xl text-[13px] text-navy">{step.text}</p>
      </div>
      <button type="button" className="btn-primary" disabled={busy} onClick={step.act}>
        {step.label} <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className={clsx("mt-0.5 text-[13px] break-words", empty ? "text-muted" : "font-medium text-navy")}>{empty ? "—" : children}</p>
    </div>
  );
}

/** Everything the file holds about the customer, the loan, the business and the bank login, in one place at the top. */
export function FileAtAGlance({ app }: { app: ApplicationDetail }) {
  const a = app.applicants.find((x) => x.isPrimary) ?? app.applicants[0];
  const block = (title: string, children: React.ReactNode) => (
    <div>
      <h3 className="mb-2 border-b border-line pb-1 text-[12px] font-bold tracking-wide text-gold-dark uppercase">{title}</h3>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </div>
  );
  return (
    <section className="card space-y-5 p-5" aria-label="File details">
      {block("Applicant", <>
        <Item label="Name">{a?.name}</Item>
        <Item label="Mobile">{a?.phone}</Item>
        <Item label="Email">{a?.email}</Item>
        <Item label="Date of birth">{a?.dateOfBirth ? formatDate(a.dateOfBirth) : null}</Item>
        <Item label="PAN">{a?.pan}</Item>
        <Item label="Aadhaar (last 4)">{a?.aadhaarLast4}</Item>
        <Item label="CIBIL score">{a?.cibilScore ? String(a.cibilScore) : "Not recorded"}</Item>
        <Item label="Work">{a?.employmentType ? EMPLOYMENT_TYPE_LABEL[a.employmentType] : null}</Item>
        <Item label="Monthly income">{a?.monthlyIncome ? formatAmount(a.monthlyIncome) : null}</Item>
        <Item label="Address">{[a?.address, a?.city, a?.pincode].filter(Boolean).join(", ")}</Item>
      </>)}
      {block("Loan", <>
        <Item label="File number">{app.applicationNo}</Item>
        <Item label="Loan type">{app.loanProduct?.name}</Item>
        <Item label="Amount">{formatAmount(app.requestedAmount)}</Item>
        <Item label="Tenure">{app.tenureMonths ? `${app.tenureMonths} months` : null}</Item>
        <Item label="Purpose">{app.purpose}</Item>
        <Item label="Lender">{app.lender?.name}</Item>
      </>)}
      {(a?.constitution || a?.employerName) && block("Business", <>
        <Item label="Entity type">{a?.constitution ? CONSTITUTION_LABEL[a.constitution] : null}</Item>
        <Item label="Employer / business">{a?.employerName}</Item>
      </>)}
      {block("Internal", <>
        <Item label="Sourced by">{app.lead ? humanize(app.lead.source) : "Direct"}</Item>
        <Item label="Assigned to">{app.owner?.name}</Item>
        <Item label="Created on">{formatDate(app.createdAt)}</Item>
        <Item label="Stage">{APPLICATION_STATUS_LABEL[app.status]}</Item>
      </>)}
      {block("Bank login", <>
        <Item label="Status">{app.bankLoginAt ? "Login done" : "Not logged in"}</Item>
        <Item label="Login date">{app.bankLoginAt ? formatDate(app.bankLoginAt) : null}</Item>
        <Item label="Bank application ID">{app.bankReferenceNo}</Item>
        <Item label="Login fees">{app.loginFees ? formatAmount(app.loginFees) : null}</Item>
        <Item label="Banker">{[app.bankerName, app.bankerMobile].filter(Boolean).join(" · ")}</Item>
        <Item label="Channel">{app.dsaChannel}</Item>
      </>)}
    </section>
  );
}

const SECTIONS = [
  ["loan", "Loan"],
  ["credit", "Credit evaluation"],
  ["login", "Bank login"],
  ["customer-form", "Customer form"],
  ["sanction", "Sanction"],
  ["disbursement", "Disbursal"],
  ["applicants", "Applicants"],
  ["checklist", "Required documents"],
  ["documents", "Documents"],
  ["references", "References"],
] as const;

/** Jump links to each part of the file, which is one long page. */
export function SectionNav() {
  return (
    <nav aria-label="Sections of this file" className="no-print flex flex-wrap gap-1.5">
      {SECTIONS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-muted transition hover:border-navy/30 hover:text-navy"
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

/** EMI for a sanctioned amount, rate (% a year) and tenure in months; null until all three are known. */
export function emi(amount: number, annualRate: number, months: number): number | null {
  if (!(amount > 0) || !(annualRate > 0) || !(months > 0)) return null;
  const r = annualRate / 12 / 100;
  return (amount * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}
