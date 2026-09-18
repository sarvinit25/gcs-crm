import clsx from "clsx";
import {
  APPLICATION_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  SANCTION_STATUS_LABEL,
  type ApplicationStatus,
  type LeadStatus,
  type SanctionStatus,
} from "../lib/types";

const TONE: Record<LeadStatus, string> = {
  NEW: "bg-navy/8 text-navy",
  CONTACTED: "bg-sky-50 text-sky-700",
  QUALIFIED: "bg-gold-pale text-gold-dark",
  DOCS_PENDING: "bg-amber-50 text-amber-700",
  CONVERTED: "bg-emerald-50 text-emerald-700",
  LOST: "bg-slate-100 text-slate-500",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        TONE[status],
      )}
    >
      {LEAD_STATUS_LABEL[status]}
    </span>
  );
}

const APP_TONE: Record<ApplicationStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-navy/8 text-navy",
  BANK_LOGIN: "bg-sky-50 text-sky-700",
  UNDER_REVIEW: "bg-amber-50 text-amber-700",
  SANCTIONED: "bg-gold-pale text-gold-dark",
  DISBURSED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
  WITHDRAWN: "bg-slate-100 text-slate-500",
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        APP_TONE[status],
      )}
    >
      {APPLICATION_STATUS_LABEL[status]}
    </span>
  );
}

const SANCTION_TONE: Record<SanctionStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

export function SanctionStatusBadge({
  status,
  label,
}: {
  status: SanctionStatus;
  label?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        SANCTION_TONE[status],
      )}
    >
      {label ? `${label}: ` : ""}
      {SANCTION_STATUS_LABEL[status]}
    </span>
  );
}
