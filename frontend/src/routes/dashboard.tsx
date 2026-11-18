import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeIndianRupee,
  Banknote,
  Download,
  FileText,
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
import { HubCharts } from "./reports-hub";
import type { Hub } from "../lib/reports";
import { CountUp } from "../components/count-up";
import { TodayList } from "../components/today-list";
import { DashboardAnalytics } from "../components/dashboard-analytics";
import { stageShares } from "../lib/dashboard-analytics";
import { Link } from "@tanstack/react-router";
import { DashboardSkeleton } from "../components/skeleton";
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
  commissionEarned: string | number | null;
};

function Stat({
  label,
  value,
  title,
  icon: Icon,
  tint,
  className = "",
  to,
}: {
  label: string;
  value: React.ReactNode;
  /** Full figure, for when the displayed value is abbreviated. */
  title?: string;
  icon: LucideIcon;
  tint: string;
  className?: string;
  /** Makes the whole tile a link to the page this figure comes from. */
  to?: string;
}) {
  const inner = (
    <>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold tracking-normal text-muted uppercase sm:text-[11px] sm:tracking-wide">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold text-navy">{value}</p>
      </div>
    </>
  );
  const cls = `card lift flex items-center gap-3.5 p-4 ${className}`;
  return to ? (
    <Link to={to as never} className={cls} title={title ?? `Open ${label}`}>
      {inner}
    </Link>
  ) : (
    <div className={cls} title={title}>
      {inner}
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

/** Where every lead stands: one stacked bar for the whole picture, then a tile per stage with its count and share. */
function LeadPipeline({ total, byStatus }: { total: number; byStatus: Record<string, number | undefined> }) {
  const stages = stageShares(byStatus, total);
  const converted = stages.find((s) => s.key === "CONVERTED")!;
  const lost = stages.find((s) => s.key === "LOST")!;
  return (
    <section className="card flex flex-col p-5" aria-label="Lead pipeline">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-navy">Lead pipeline</h2>
          <p className="text-[12px] text-muted">Every lead, by where it stands</p>
        </div>
        <div className="text-right">
          <p className="text-2xl leading-none font-bold text-navy">{total}</p>
          <p className="mt-1 text-[11px] font-bold tracking-wide text-muted uppercase">Total leads</p>
        </div>
      </div>

      {total === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted">No leads in this period.</p>
      ) : (
        <>
          <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-bg-light" role="img" aria-label={stages.map((s) => `${s.label} ${s.count}`).join(", ")}>
            {stages
              .filter((s) => s.width > 0)
              .map((s) => (
                <div key={s.key} className="bar-grow h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${s.width}%`, backgroundColor: s.color }} title={`${s.label}: ${s.count} (${s.percent}%)`} />
              ))}
          </div>

          <ul className="mt-4 grid flex-1 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3">
            {stages.map((s) => (
              <li key={s.key} className="flex">
                <Link
                  to="/leads"
                  search={{ status: s.key } as never}
                  title={`Open the ${s.label.toLowerCase()} leads`}
                  className="lift flex w-full flex-col justify-center rounded-xl border border-line bg-bg-light/50 p-3 hover:border-navy/30"
                >
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-muted">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </p>
                  <p className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-navy">{s.count}</span>
                    <span className="text-[12px] text-muted">{s.percent}%</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-[13px] text-muted">
            <span>
              Converted <span className="font-bold text-emerald-600">{converted.percent}%</span>
            </span>
            <span>
              Lost <span className="font-bold text-red-500">{lost.percent}%</span>
            </span>
            <span>
              Still open <span className="font-bold text-navy">{total - converted.count - lost.count}</span>
            </span>
          </p>
        </>
      )}
    </section>
  );
}

function Meter({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-navy">{pct}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg-light">
        <div className="bar-grow h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
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

  // The same charts as the Reports page, for the period chosen above.
  const overview = useQuery({
    queryKey: ["dashboard-overview", range],
    queryFn: () => api<Hub>(`/reports/hub?range=${range}`),
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
              className="btn-primary whitespace-nowrap"
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
          <DashboardSkeleton />
        ) : query.isError ? (
          <p className="py-16 text-center text-sm text-red-600">{(query.error as Error).message}</p>
        ) : (
          <>
            <div
              className={`grid grid-cols-2 gap-3 lg:grid-cols-3 ${query.data.commissionEarned === null ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}
            >
              <Stat
                label="Leads"
                to="/leads"
                value={<CountUp value={query.data.leads.total} />}
                icon={Users}
                tint="bg-sky-50 text-sky-600"
              />
              <Stat
                label="Applications"
                to="/applications"
                value={<CountUp value={query.data.applications} />}
                icon={FileText}
                tint="bg-violet-50 text-violet-600"
              />
              <Stat
                label="Sanctions"
                to="/sanctions"
                value={<CountUp value={query.data.sanctions} />}
                icon={ShieldCheck}
                tint="bg-amber-50 text-amber-600"
              />
              <Stat
                label="Disbursed"
                to="/disbursements"
                value={<CountUp value={Number(query.data.disbursements.amount)} format={formatCompact} />}
                title={formatAmount(query.data.disbursements.amount)}
                icon={Banknote}
                tint="bg-emerald-50 text-emerald-600"
              />
              {query.data.commissionEarned !== null && (
              <Stat
                  label="Commission"
                  to="/commissions"
                  value={<CountUp value={Number(query.data.commissionEarned)} format={formatCompact} />}
                  title={formatAmount(query.data.commissionEarned)}
                  className="col-span-2 lg:col-span-1"
                  icon={BadgeIndianRupee}
                  tint="bg-gold-pale/60 text-gold-dark"
                />
              )}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
              <LeadPipeline total={query.data.leads.total} byStatus={query.data.leads.byStatus} />

              <TodayList title={user?.role === "ADVISOR" ? "My day" : "Needs attention"} limit={5} />
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
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-navy">Loan distribution</h2>
                    <p className="text-[12px] text-muted">Applications by loan type</p>
                  </div>
                  <Link to={"/applications" as never} className="shrink-0 text-[12px] font-semibold text-gold-dark hover:text-navy">
                    View applications →
                  </Link>
                </div>
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
                              className="bar-grow h-full rounded-full bg-violet-500 transition-all"
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

            <DashboardAnalytics range={range} staff={user?.role !== "ADVISOR"} />

            {overview.data && (
              <section className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-navy">Business overview</h2>
                  <Link to={"/reports" as never} className="text-[13px] font-semibold text-gold-dark hover:text-navy">
                    All reports →
                  </Link>
                </div>
                <HubCharts hub={overview.data} />
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
