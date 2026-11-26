import { Link } from "@tanstack/react-router";
import { ArrowRight, Banknote, BadgeCheck, FolderOpen, LogIn, PhoneCall, Percent, Users, XCircle } from "lucide-react";
import clsx from "clsx";
import { fillLast } from "../lib/grid-fill";
import { reportCardText, type ReportCard } from "../lib/reports";

export const REPORT_ICON: Record<string, typeof Users> = {
  leads: Users,
  callbacks: PhoneCall,
  files: FolderOpen,
  "login-files": LogIn,
  sanctions: BadgeCheck,
  disbursals: Banknote,
  rejects: XCircle,
  commissions: Percent,
};

const CARD = "card lift group flex min-w-0 items-start gap-3 p-4 text-left";

/**
 * The eight detailed reports as cards, each with the number of records behind it. With `onOpen` a card opens its report in place
 * (the Reports page); without it, a card is a link to that report's own page (the Dashboard).
 */
export function DetailedReportCards({ reports, counts, onOpen }: { reports: ReportCard[]; counts: Record<string, number>; onOpen?: (kind: string) => void }) {
  const last = fillLast(reports.length, [
    { at: "sm:", cols: 2 },
    { at: "lg:", cols: 4 },
  ]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {reports.map((r, i) => {
        const Icon = REPORT_ICON[r.kind] ?? FolderOpen;
        const text = reportCardText(r);
        const className = clsx(CARD, i === reports.length - 1 && last);
        const body = (
          <>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-pale/60 text-gold-dark">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-navy">{text.title}</span>
              <span className="mt-0.5 block text-[12px] text-muted">{text.blurb}</span>
              {counts[r.kind] !== undefined && (
                <span className="mt-1 block text-[12px] font-bold text-navy">
                  {counts[r.kind]} {counts[r.kind] === 1 ? "record" : "records"}
                </span>
              )}
            </span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-navy" />
          </>
        );
        return onOpen ? (
          <button key={r.kind} type="button" onClick={() => onOpen(r.kind)} className={className}>
            {body}
          </button>
        ) : (
          <Link key={r.kind} to={`/reports/${r.kind}` as never} className={className}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}
