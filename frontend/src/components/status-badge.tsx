import clsx from "clsx";
import { PRIORITY_META } from "../lib/priority";
import {
  APPLICATION_STATUS_LABEL,
  LEAD_SEGMENT_HINT,
  LEAD_SEGMENT_LABEL,
  LEAD_STATUS_LABEL,
  SANCTION_STATUS_LABEL,
  type ApplicationStatus,
  type LeadSegment,
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

/** A lead's priority as a coloured pill with its symbol (flame, sun, phone, snowflake), the same look everywhere. */
export function SegmentBadge({ segment, note }: { segment: LeadSegment | null; note?: string | null }) {
  if (!segment) return <span className="text-[12px] text-muted">—</span>;
  const look = PRIORITY_META[segment];
  const Icon = look.icon;
  return (
    <span
      title={note ?? LEAD_SEGMENT_HINT[segment]}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ backgroundColor: look.tint, color: look.text, boxShadow: `inset 0 0 0 1px ${look.ring}` }}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {LEAD_SEGMENT_LABEL[segment]}
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
