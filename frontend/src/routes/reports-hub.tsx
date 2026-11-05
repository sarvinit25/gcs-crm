import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Banknote, BadgeCheck, FolderOpen, Loader2, LogIn, PhoneCall, Percent, RefreshCw, Table2, Users, XCircle } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatAmount, formatCompact } from "../lib/format";
import { SERIES } from "../lib/charts";
import { fillLast } from "../lib/grid-fill";
import type { Hub } from "../lib/reports";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/app-shell";
import { DatePicker } from "../components/date-picker";
import { DashboardSkeleton } from "../components/skeleton";
import { ChartCard, DonutChart, HBarChart, LineChart } from "../components/charts";

const ICON: Record<string, typeof Users> = {
  leads: Users,
  callbacks: PhoneCall,
  files: FolderOpen,
  "login-files": LogIn,
  sanctions: BadgeCheck,
  disbursals: Banknote,
  rejects: XCircle,
  commissions: Percent,
};

function Kpi({ label, value, sub, className }: { label: string; value: string; sub: string; className?: string }) {
  return (
    <div className={clsx("card min-w-0 p-4", className)}>
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1.5 truncate text-2xl font-bold text-navy">{value}</p>
      <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
    </div>
  );
}

export function ReportsHubPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // The range only applies when "Refresh" is pressed or a date is picked — both just re-run the query.
  const query = useQuery({
    queryKey: ["reports-hub", { from, to }],
    queryFn: () => api<Hub>(`/reports/hub${qs({ from, to })}`),
    placeholderData: (prev) => prev,
  });
  const hub = query.data;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={user?.role === "ADVISOR" ? "Your own business at a glance" : "Your whole loan business at a glance"}
        actions={
          <Link to={"/reports/analysis" as never} className="btn-ghost">
            <Table2 className="h-4 w-4" /> Tables &amp; record reports
          </Link>
        }
      />

      <div className="px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <DatePicker value={from} onChange={setFrom} max={to || undefined} className="w-44" title="From" placeholder="From date" />
          <DatePicker value={to} onChange={setTo} min={from || undefined} className="w-44" title="To" placeholder="To date" />
          {(from || to) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="btn-ghost"
            >
              Clear
            </button>
          )}
          <button onClick={() => void query.refetch()} className="btn-ghost" disabled={query.isFetching}>
            {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </button>
          {hub && <p className="ml-auto text-[12px] text-muted">{hub.range.label}</p>}
        </div>

        {query.isPending ? (
          <DashboardSkeleton />
        ) : query.isError || !hub ? (
          <p className="py-10 text-sm text-red-600">{(query.error as Error | null)?.message ?? "Could not load the reports."}</p>
        ) : (
          <HubBody hub={hub} />
        )}
      </div>
    </>
  );
}

function HubBody({ hub }: { hub: Hub }) {
  const k = hub.kpis;
  const cards = [
    { label: "Total leads", value: String(k.leads.total), sub: `${k.leads.thisMonth} this month` },
    { label: "Active files", value: String(k.activeFiles.total), sub: `${k.activeFiles.loggedIn} logged in with banks` },
    { label: "Sanctioned", value: formatCompact(k.sanctioned.amount), sub: `${k.sanctioned.count} sanctions · ${k.sanctioned.thisMonth} this month` },
    { label: "Disbursed", value: formatCompact(k.disbursed.amount), sub: `${formatCompact(k.disbursed.thisMonthAmount)} this month · ${k.disbursed.count} payouts` },
    ...(k.commission ? [{ label: "Commission", value: formatCompact(k.commission.total), sub: `${formatCompact(k.commission.pending)} pending` }] : []),
  ];
  const lastKpi = fillLast(cards.length, [{ at: "", cols: 2 }]);
  const kpiCols = cards.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4";

  const cards2 = hub.reports;
  const cardClass = fillLast(cards2.length, [
    { at: "sm:", cols: 2 },
    { at: "lg:", cols: 4 },
  ]);

  return (
    <div className="space-y-5">
      <div className={clsx("grid grid-cols-2 gap-3", kpiCols)}>
        {cards.map((card, i) => (
          <Kpi key={card.label} {...card} className={i === cards.length - 1 ? clsx(lastKpi, "xl:col-span-1") : undefined} />
        ))}
      </div>

      <HubCharts hub={hub} />

      <div>
        <h2 className="mb-3 text-sm font-bold text-navy">Detailed reports</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards2.map((r, i) => {
            const Icon = ICON[r.kind] ?? FolderOpen;
            return (
              <Link
                key={r.kind}
                to={`/reports/${r.kind}` as never}
                className={clsx("card lift group flex min-w-0 items-start gap-3 p-4", i === cards2.length - 1 && cardClass)}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-pale/60 text-gold-dark">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-navy">{r.title}</span>
                  <span className="mt-0.5 block text-[12px] text-muted">{r.blurb}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-navy" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Every chart on the hub: trends, pipeline, lenders, commission, funnel, loan types and lost reasons. Also shown on the Dashboard. */
export function HubCharts({ hub }: { hub: Hub }) {
  const months = hub.trends.map((t) => t.month);
  const noTrend = hub.trends.every((t) => t.leads + t.files + t.sanctions + t.disbursals === 0);
  const pipelineSlices = hub.pipeline.stages.map((s) => ({ key: s.key, label: s.label, value: s.count }));
  const c = hub.commission;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ChartCard title="Monthly trends" note="Last 6 months" empty={noTrend} emptyText="No leads, files, sanctions or disbursals in the last 6 months.">
        <LineChart
          months={months}
          labels={hub.trends.map((t) => t.label)}
          ariaLabel="Monthly trends for the last 6 months: leads, files, sanctions and disbursals"
          series={[
            { name: "Leads", color: SERIES[0], values: hub.trends.map((t) => t.leads) },
            { name: "Files", color: SERIES[1], values: hub.trends.map((t) => t.files) },
            { name: "Sanctions", color: SERIES[2], values: hub.trends.map((t) => t.sanctions) },
            { name: "Disbursals", color: SERIES[3], values: hub.trends.map((t) => t.disbursals) },
          ]}
        />
      </ChartCard>

      <ChartCard title="File pipeline" note="Files by stage" empty={hub.pipeline.total === 0} emptyText="No files in this period.">
        <DonutChart slices={pipelineSlices} centreValue={String(hub.pipeline.total)} centreLabel="files" ariaLabel={`File pipeline: ${hub.pipeline.total} files by stage`} />
      </ChartCard>

      <ChartCard
        title="Lender performance"
        note="Top by sanctioned amount"
        empty={hub.lenders.length === 0}
        emptyText="No sanctions from lenders in this period."
        className={c ? undefined : "lg:col-span-2"}
      >
        <HBarChart
          ariaLabel="Lenders by sanctioned amount"
          rows={hub.lenders.map((l) => ({
            key: l.lender,
            label: l.lender,
            value: l.sanctionedAmount,
            display: formatCompact(l.sanctionedAmount),
            sub: `${l.sanctions} ${l.sanctions === 1 ? "sanction" : "sanctions"}`,
          }))}
        />
      </ChartCard>

      {c && (
        <ChartCard title="Commission breakdown" note="Due, claimed and received" empty={c.total === 0} emptyText="No commission in this period.">
          <DonutChart
            slices={[
              { key: "due", label: "Due", value: c.due, display: formatCompact(c.due) },
              { key: "claimed", label: "Claimed", value: c.claimed, display: formatCompact(c.claimed) },
              { key: "received", label: "Received", value: c.received, display: formatCompact(c.received) },
            ]}
            centreValue={formatCompact(c.total)}
            centreLabel="gross"
            ariaLabel={`Commission of ${formatAmount(c.total)}: ${formatAmount(c.due)} due, ${formatAmount(c.claimed)} claimed, ${formatAmount(c.received)} received`}
          />
        </ChartCard>
      )}

      <ChartCard title="Conversion funnel" note="From enquiry to payout" empty={hub.funnel[0].count === 0} emptyText="No leads in this period.">
        <HBarChart
          ariaLabel="Conversion funnel: leads, files opened, logged in with a bank, sanctioned and disbursed"
          rows={hub.funnel.map((st) => ({
            key: st.key,
            label: st.label,
            value: st.count,
            display: String(st.count),
            sub: st.ofPrevious == null ? undefined : `${st.ofPrevious}% of the step before`,
          }))}
        />
      </ChartCard>

      <ChartCard title="Loan type breakdown" note="Files by loan type" empty={hub.loanTypes.length === 0} emptyText="No files in this period.">
        <DonutChart
          slices={hub.loanTypes.map((t, i) => ({ key: `${i}`, label: t.name, value: t.count, display: `${t.count} · ${formatCompact(t.amount)}` }))}
          centreValue={String(hub.loanTypes.reduce((n, t) => n + t.count, 0))}
          centreLabel="files"
          ariaLabel={`Files by loan type: ${hub.loanTypes.map((t) => `${t.name} ${t.count}`).join(", ")}`}
        />
      </ChartCard>

      <ChartCard
        title="Why enquiries are lost"
        note="Reasons recorded when a lead is closed"
        empty={hub.lostReasons.length === 0}
        emptyText="No lost leads in this period."
        className="lg:col-span-2"
      >
        <HBarChart
          ariaLabel="Reasons leads were lost"
          rows={hub.lostReasons.map((r) => ({ key: r.reason, label: r.reason, value: r.count, display: String(r.count) }))}
        />
      </ChartCard>
    </div>
  );
}
