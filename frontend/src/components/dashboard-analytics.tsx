import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Flame, Globe, Headphones, MessageCircle, Phone, Scale, TrendingUp, UserX, Users, UsersRound, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatAmount, formatCompact } from "../lib/format";
import { SERIES } from "../lib/charts";
import { formName, openLeads, prioritySlices, sourceSlices, type Analytics } from "../lib/dashboard-analytics";
import { leadsLink } from "../lib/lead-filters";
import { formatDuration, type TelephonyStats } from "../lib/telephony";
import { ChartCard, DonutChart, HBarChart, LineChart } from "./charts";

type TabId = "leads" | "team" | "channels";

/** Each module keeps one colour wherever it appears on the Dashboard: a tile, a card edge, a tab. */
const TONE = {
  sky: { tile: "bg-sky-50 text-sky-600", edge: "border-t-sky-500", tab: "bg-sky-600" },
  red: { tile: "bg-red-50 text-red-600", edge: "border-t-red-500", tab: "bg-red-600" },
  amber: { tile: "bg-amber-50 text-amber-600", edge: "border-t-amber-500", tab: "bg-amber-600" },
  emerald: { tile: "bg-emerald-50 text-emerald-600", edge: "border-t-emerald-500", tab: "bg-emerald-600" },
  indigo: { tile: "bg-indigo-50 text-indigo-600", edge: "border-t-indigo-500", tab: "bg-indigo-600" },
  blue: { tile: "bg-blue-50 text-blue-600", edge: "border-t-blue-500", tab: "bg-blue-600" },
  green: { tile: "bg-green-50 text-green-600", edge: "border-t-green-500", tab: "bg-green-600" },
  rose: { tile: "bg-rose-50 text-rose-600", edge: "border-t-rose-500", tab: "bg-rose-600" },
  teal: { tile: "bg-teal-50 text-teal-600", edge: "border-t-teal-500", tab: "bg-teal-600" },
} as const;
type Tone = keyof typeof TONE;

function MiniStat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  link,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone: Tone;
  /** Makes the whole tile a link, e.g. to the Leads page with a filter. */
  link?: { to: string; search?: object };
}) {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", TONE[tone].tile)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
          <p className="text-xl font-bold text-navy">{value}</p>
        </div>
        {link && <ArrowRight className="h-4 w-4 shrink-0 text-muted/50" aria-hidden />}
      </div>
      {hint && <p className="mt-2 text-[12px] text-muted">{hint}</p>}
    </>
  );
  const cls = clsx("card block border-t-[3px] p-4", TONE[tone].edge);
  return link ? (
    <Link to={link.to as never} search={link.search as never} className={clsx(cls, "lift")} title={`Open: ${label}`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function ChannelCard({
  icon: Icon,
  title,
  tone,
  to,
  stats,
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone: Tone;
  to: string;
  stats: { label: string; value: React.ReactNode }[];
  children?: React.ReactNode;
}) {
  return (
    <section className={clsx("card border-t-[3px] p-5", TONE[tone].edge)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-sm font-bold text-navy">
          <span className={clsx("grid h-8 w-8 place-items-center rounded-lg", TONE[tone].tile)}>
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </h3>
        <Link to={to as never} className="inline-flex items-center gap-1 text-[12px] font-semibold text-gold-dark hover:text-navy">
          Open <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label}>
            <dd className="text-xl font-bold text-navy">{s.value}</dd>
            <dt className="text-[11px] text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>
      {children && <div className="mt-4 border-t border-line pt-3">{children}</div>}
    </section>
  );
}

function LeadsTab({ data, staff }: { data: Analytics["leads"]; staff: boolean }) {
  const navigate = useNavigate();
  const open = (filter: Parameters<typeof leadsLink>[0]) => void navigate(leadsLink(filter) as never);
  const total = openLeads(data.priority);
  const sourceTotal = data.sources.reduce((n, s) => n + s.count, 0);
  const trendMonths = data.trend.map((t) => t.month);
  const noTrend = data.trend.every((t) => t.leads === 0);
  return (
    <div className="space-y-4">
      <div className={clsx("grid grid-cols-2 gap-3", staff ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        <MiniStat icon={Users} label="Open leads" value={total} tone="sky" hint="Not yet converted or lost" link={leadsLink()} />
        <MiniStat
          icon={Flame}
          label="Hot now"
          value={data.priority.HOT}
          tone="red"
          hint={total ? `${Math.round((data.priority.HOT / total) * 100)}% of open leads` : "No open leads"}
          link={leadsLink({ segment: "HOT" })}
        />
        <MiniStat
          icon={TrendingUp}
          label="Follow-ups overdue"
          value={data.overdueFollowUps}
          tone={data.overdueFollowUps ? "amber" : "emerald"}
          hint={data.overdueFollowUps ? "Call these first" : "All caught up"}
          link={leadsLink({ dueOnly: true })}
        />
        {staff && (
          <MiniStat
            icon={UserX}
            label="Unassigned"
            value={data.unassigned}
            tone={data.unassigned ? "amber" : "emerald"}
            hint={data.unassigned ? "Nobody owns these yet" : "Every lead has an owner"}
            link={leadsLink({ owner: "none" })}
          />
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Where leads come from" note="Click a slice or a name to open those leads" empty={data.sources.length === 0} emptyText="No leads in this period.">
          <DonutChart
            ariaLabel="Leads by source"
            centreLabel="Leads"
            centreValue={String(sourceTotal)}
            slices={sourceSlices(data.sources)}
            onSelect={(source) => open({ source })}
          />
        </ChartCard>
        <ChartCard title="Priority now" note="Open leads, Hot to Cold. Click to open them" empty={total === 0} emptyText="No open leads.">
          <DonutChart
            ariaLabel="Open leads by priority"
            centreLabel="With a priority"
            centreValue={String(total - data.priority.NONE)}
            slices={prioritySlices(data.priority)}
            onSelect={(segment) => open({ segment })}
          />
          {data.priority.NONE > 0 && <p className="mt-3 text-[12px] text-muted">{data.priority.NONE} more with no priority yet.</p>}
        </ChartCard>
        <ChartCard title="Leads and conversions" note="Last 6 months, by month the lead came in" empty={noTrend} emptyText="No leads in the last 6 months.">
          <LineChart
            months={trendMonths}
            labels={data.trend.map((t) => t.label)}
            ariaLabel="Leads that came in each month, and how many were converted"
            series={[
              { name: "Leads", color: SERIES[0], values: data.trend.map((t) => t.leads) },
              { name: "Converted", color: SERIES[2], values: data.trend.map((t) => t.converted) },
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function TeamTab({ rows }: { rows: NonNullable<Analytics["team"]> }) {
  const max = Math.max(1, ...rows.map((r) => r.disbursed));
  if (rows.length === 0) {
    return <p className="card py-12 text-center text-[13px] text-muted">No team activity in this period yet.</p>;
  }
  return (
    <section className="card overflow-x-auto border-t-[3px] border-t-indigo-500">
      <div className="px-5 pt-4">
        <h3 className="text-sm font-bold text-navy">Team</h3>
        <p className="text-[12px] text-muted">Ranked by money disbursed, then conversions. Only people with activity in the period are listed.</p>
      </div>
      <table className="mt-3 w-full text-left text-[13px]">
        <thead className="border-y border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
          <tr>
            <th className="px-5 py-2.5 font-bold">#</th>
            <th className="px-3 py-2.5 font-bold">Name</th>
            <th className="px-3 py-2.5 text-right font-bold">Leads</th>
            <th className="px-3 py-2.5 text-right font-bold">Converted</th>
            <th className="px-3 py-2.5 text-right font-bold">Applications</th>
            <th className="px-3 py-2.5 text-right font-bold">Follow-ups</th>
            <th className="px-5 py-2.5 font-bold">Disbursed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-b border-line/70 last:border-0 hover:bg-bg-light/70">
              <td className="px-5 py-2.5">
                <span className={clsx("grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold", i === 0 ? "bg-amber-100 text-amber-700" : "bg-bg-light text-muted")}>{i + 1}</span>
              </td>
              <td className="px-3 py-2.5 font-semibold text-navy">
                <Link to="/leads" search={{ owner: r.id } as never} className="hover:underline" title={`Open ${r.name}'s leads`}>
                  {r.name}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-right">{r.leads}</td>
              <td className="px-3 py-2.5 text-right">
                {r.converted} <span className="text-[11px] text-muted">({r.conversionPct}%)</span>
              </td>
              <td className="px-3 py-2.5 text-right">{r.applications}</td>
              <td className="px-3 py-2.5 text-right">{r.followUps}</td>
              <td className="min-w-44 px-5 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-light">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(r.disbursed / max) * 100}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-[12px] font-semibold text-navy" title={formatAmount(r.disbursed)}>
                    {r.disbursed ? formatCompact(r.disbursed) : "—"}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ChannelsTab({ data, range }: { data: NonNullable<Analytics["channels"]>; range: string }) {
  const calls = useQuery({
    queryKey: ["dashboard-telecaller", range],
    queryFn: () => api<TelephonyStats>(`/telephony/stats?range=${range}`),
    retry: false,
    staleTime: 60_000,
  });
  const w = data.website;
  const t = calls.data?.totals;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChannelCard
        icon={Globe}
        title="Website enquiries"
        tone="blue"
        to="/website"
        stats={[
          { label: "Received", value: w.received },
          { label: "Became new leads", value: w.newLeads },
          { label: "CA & Legal", value: w.caLegal },
        ]}
      >
        {w.byForm.length === 0 ? (
          <p className="text-[12px] text-muted">Nothing has come in from the website in this period.</p>
        ) : (
          <HBarChart ariaLabel="Website entries by form" color={SERIES[0]} rows={w.byForm.map((f) => ({ key: f.form, label: formName(f.form), value: f.count, display: String(f.count) }))} />
        )}
      </ChannelCard>

      <ChannelCard
        icon={MessageCircle}
        title="WhatsApp"
        tone="green"
        to="/whatsapp"
        stats={[
          { label: "Need a person", value: data.whatsapp.needsHuman },
          { label: "Unread messages", value: data.whatsapp.unread },
          { label: "Messages in / out", value: `${data.whatsapp.received} / ${data.whatsapp.sent}` },
        ]}
      >
        <p className="text-[12px] text-muted">{data.whatsapp.needsHuman ? "Chats waiting for a person to answer are flagged in the inbox." : "No chat is waiting for a person."}</p>
      </ChannelCard>

      <ChannelCard
        icon={Headphones}
        title="AI phone calls"
        tone="rose"
        to="/voice-calls"
        stats={[
          { label: "Calls", value: data.voice.calls },
          { label: "Leads created", value: data.voice.leadsCreated },
          { label: "Average call", value: data.voice.avgSeconds ? formatDuration(data.voice.avgSeconds) : "—" },
        ]}
      />

      <ChannelCard
        icon={Phone}
        title="Telecaller (Plivo)"
        tone="teal"
        to="/telephony"
        stats={[
          { label: "Calls", value: t ? t.calls : "—" },
          { label: "Pick-up rate", value: t ? `${t.answerRate}%` : "—" },
          { label: "Talk time", value: t ? formatDuration(t.totalSeconds) : "—" },
        ]}
      >
        <p className="text-[12px] text-muted">
          {calls.isPending
            ? "Reading call records from Plivo…"
            : calls.isError
              ? "Plivo is not connected yet. Open Telecaller to see what is needed."
              : range === "all"
                ? "Showing the last 30 days; Plivo cannot list every call ever made."
                : "From Plivo's call records for the period chosen above."}
        </p>
      </ChannelCard>
    </div>
  );
}

/** The Dashboard's per-module analytics: leads for everyone, team and channels for managers and admins. */
export function DashboardAnalytics({ range, staff }: { range: string; staff: boolean }) {
  const [tab, setTab] = useState<TabId>("leads");
  const query = useQuery({
    queryKey: ["dashboard-analytics", range],
    queryFn: () => api<Analytics>(`/dashboard/analytics?range=${range}`),
    placeholderData: (prev) => prev,
  });

  const tabs: { id: TabId; label: string; icon: LucideIcon; tone: Tone }[] = [
    { id: "leads", label: "Leads", icon: Users, tone: "sky" },
    ...(staff
      ? ([
          { id: "team", label: "Team", icon: UsersRound, tone: "indigo" },
          { id: "channels", label: "Channels", icon: Scale, tone: "teal" },
        ] as const)
      : []),
  ];
  const d = query.data;

  return (
    <section className="mt-6" aria-label="Module analytics">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-navy">Module analytics</h2>
        <div className="flex gap-1.5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition",
                tab === t.id ? `${TONE[t.tone].tab} border-transparent text-white` : "border-line bg-white text-navy hover:border-navy/30",
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>
      {query.isPending ? (
        <div className="grid gap-3 lg:grid-cols-4" role="status" aria-label="Loading">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : query.isError || !d ? (
        <p className="card py-10 text-center text-[13px] text-red-600">{(query.error as Error | null)?.message ?? "Could not load the analytics."}</p>
      ) : (
        <>
          {tab === "leads" && <LeadsTab data={d.leads} staff={staff} />}
          {tab === "team" && staff && d.team && <TeamTab rows={d.team} />}
          {tab === "channels" && staff && d.channels && <ChannelsTab data={d.channels} range={range} />}
        </>
      )}
    </section>
  );
}
