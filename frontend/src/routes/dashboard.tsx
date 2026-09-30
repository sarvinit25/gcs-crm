import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeIndianRupee,
  Banknote,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { formatAmount, formatCompact } from "../lib/format";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "../lib/types";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/app-shell";
import { PunchCard } from "../components/punch-card";
import { PeriodSelect } from "../components/period-select";
import { todayIST } from "../lib/date";

type Summary = {
  range: string;
  period: string;
  loanDistribution: { name: string; count: number; amount: number }[];
  performance: {
    leadToApplicationPct: number;
    applicationToSanctionPct: number;
    sanctionedToDisbursedPct: number;
    averageTicket: number;
    requestedAmount: number;
    sanctionedAmount: number;
    disbursedAmount: number;
  };
  leads: { total: number; dueFollowUps: number; byStatus: Record<string, number> };
  applications: number;
  sanctions: number;
  disbursements: { count: number; amount: string | number };
  commissionEarned: string | number;
};

function Stat({
  label,
  value,
  title,
  icon: Icon,
  tint,
  className = "",
}: {
  label: string;
  value: string;
  /** Full figure, for when the displayed value is abbreviated. */
  title?: string;
  icon: LucideIcon;
  tint: string;
  className?: string;
}) {
  return (
    <div className={`card flex items-center gap-3.5 p-4 ${className}`} title={title}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold text-navy">{value}</p>
      </div>
    </div>
  );
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportSummary(d: Summary) {
  downloadCsv(`dashboard-${d.range}-${todayIST()}.csv`, [
    ["GCS dashboard", d.period],
    [],
    ["Metric", "Value"],
    ["Leads", d.leads.total],
    ["Applications", d.applications],
    ["Sanctions", d.sanctions],
    ["Disbursements (count)", d.disbursements.count],
    ["Disbursed amount", Number(d.disbursements.amount)],
    ["Commission earned", Number(d.commissionEarned)],
    ["Lead to application %", d.performance.leadToApplicationPct],
    ["Application to sanction %", d.performance.applicationToSanctionPct],
    ["Sanctioned to disbursed %", d.performance.sanctionedToDisbursedPct],
    ["Average ticket", d.performance.averageTicket],
    [],
    ["Loan type", "Applications", "Requested amount"],
    ...d.loanDistribution.map((l) => [l.name, l.count, l.amount]),
  ]);
}

function Meter({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-navy">{pct}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg-light">
        <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState("all");
  const query = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => api<Summary>(`/dashboard/summary?range=${range}`),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name.split(" ")[0]}`}
        subtitle={
          user?.role === "ADVISOR" ? "Your pipeline at a glance" : "Whole-firm pipeline at a glance"
        }
        actions={
          <div className="flex items-center gap-2">
            <PeriodSelect value={range} onChange={setRange} className="field h-9 w-56" />
            <button
              onClick={() => query.data && exportSummary(query.data)}
              disabled={!query.data}
              className="btn-primary"
            >
              <Download className="h-4 w-4" /> Export report
            </button>
          </div>
        }
      />

      <div className="px-6 py-5">
        <div className="mb-5">
          <PunchCard />
        </div>
        {query.isPending ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : query.isError ? (
          <p className="py-16 text-center text-sm text-red-600">{(query.error as Error).message}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
              <Stat
                label="Leads"
                value={String(query.data.leads.total)}
                icon={Users}
                tint="bg-sky-50 text-sky-600"
              />
              <Stat
                label="Applications"
                value={String(query.data.applications)}
                icon={FileText}
                tint="bg-violet-50 text-violet-600"
              />
              <Stat
                label="Sanctions"
                value={String(query.data.sanctions)}
                icon={ShieldCheck}
                tint="bg-amber-50 text-amber-600"
              />
              <Stat
                label="Disbursed"
                value={formatCompact(query.data.disbursements.amount)}
                title={formatAmount(query.data.disbursements.amount)}
                icon={Banknote}
                tint="bg-emerald-50 text-emerald-600"
              />
              <Stat
                label="Commission"
                value={formatCompact(query.data.commissionEarned)}
                title={formatAmount(query.data.commissionEarned)}
                className="col-span-2 lg:col-span-1"
                icon={BadgeIndianRupee}
                tint="bg-gold-pale/60 text-gold-dark"
              />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
              <section className="card p-5">
                <h2 className="text-sm font-bold text-navy">Lead pipeline</h2>
                <div className="mt-4 space-y-2.5">
                  {LEAD_STATUSES.map((status) => {
                    const count = query.data.leads.byStatus[status] ?? 0;
                    const pct = query.data.leads.total
                      ? (count / query.data.leads.total) * 100
                      : 0;
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 text-[12px] text-muted">
                          {LEAD_STATUS_LABEL[status]}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-light">
                          <div
                            className="h-full rounded-full bg-navy transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-[12px] font-semibold text-navy">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="card p-5">
                <h2 className="text-sm font-bold text-navy">Needs attention</h2>
                <p className="mt-3 text-3xl font-bold text-red-600">
                  {query.data.leads.dueFollowUps}
                </p>
                <p className="text-[13px] text-muted">follow-ups due or overdue</p>
                <Link to="/leads" className="btn-ghost mt-4 w-full">
                  Open leads
                </Link>
              </section>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section className="card p-5">
                <h2 className="text-sm font-bold text-navy">Performance metrics</h2>
                <p className="text-[12px] text-muted">How the pipeline converts, stage to stage</p>
                <div className="mt-4 space-y-3.5">
                  <Meter
                    label="Lead → converted"
                    pct={query.data.performance.leadToApplicationPct}
                    hint={`${query.data.leads.byStatus.CONVERTED ?? 0} of ${query.data.leads.total} leads converted`}
                  />
                  <Meter
                    label="Application → sanction"
                    pct={query.data.performance.applicationToSanctionPct}
                    hint={`${query.data.sanctions} sanctions from ${query.data.applications} applications`}
                  />
                  <Meter
                    label="Sanctioned → disbursed"
                    pct={query.data.performance.sanctionedToDisbursedPct}
                    hint={`${formatAmount(query.data.performance.disbursedAmount)} of ${formatAmount(query.data.performance.sanctionedAmount)}`}
                  />
                </div>
                <p className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
                  Average ticket size{" "}
                  <span className="font-bold text-navy">
                    {formatAmount(query.data.performance.averageTicket)}
                  </span>
                </p>
              </section>

              <section className="card p-5">
                <h2 className="text-sm font-bold text-navy">Loan distribution</h2>
                <p className="text-[12px] text-muted">Applications by loan type</p>
                {query.data.loanDistribution.length === 0 ? (
                  <p className="mt-6 text-center text-[13px] text-muted">No applications in this period.</p>
                ) : (
                  <div className="mt-4 space-y-2.5">
                    {query.data.loanDistribution.slice(0, 7).map((l) => {
                      const max = query.data.loanDistribution[0].count || 1;
                      return (
                        <div key={l.name} className="flex items-center gap-3">
                          <span className="w-36 shrink-0 truncate text-[12px] text-muted" title={l.name}>
                            {l.name}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-light">
                            <div
                              className="h-full rounded-full bg-violet-500 transition-all"
                              style={{ width: `${(l.count / max) * 100}%` }}
                            />
                          </div>
                          <span className="w-24 shrink-0 text-right text-[12px] font-semibold text-navy">
                            {l.count} · {formatAmount(l.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
