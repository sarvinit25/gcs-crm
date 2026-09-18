import clsx from "clsx";
import { LEAD_STATUS_LABEL, type LeadStatus } from "../lib/types";

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
