import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Plug, Wallet } from "lucide-react";
import { api, ApiError, qs } from "../lib/api";
import { formatPhone } from "../lib/whatsapp";
import { formatDuration, hourLabel, seriesTick, type TelephonyStats } from "../lib/telephony";
import { PageHeader } from "../components/app-shell";
import { usePeriods } from "../components/period-select";
import { ChartCard, ColumnChart, DonutChart, HBarChart } from "../components/charts";
import { SERIES } from "../lib/charts";

function Tile({ icon: Icon, label, value, hint }: { icon: typeof Phone; label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
        <Icon className="h-3.5 w-3.5 text-gold-dark" /> {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export function TelephonyPage() {
  const [range, setRange] = useState("30d");
  const periods = usePeriods();
  const options = (periods.data ?? [{ value: "30d", label: "Last 30 days" }]).filter((o) => o.value !== "all");

  const query = useQuery({
    queryKey: ["telephony-stats", range],
    queryFn: () => api<TelephonyStats>(`/telephony/stats${qs({ range })}`),
    retry: false,
    staleTime: 60_000,
  });
  const d = query.data;

  return (
    <>
      <PageHeader
        title="Telecalling"
        subtitle="Calls made and received on the firm's Plivo number"
        actions={
          <select value={range} onChange={(e) => setRange(e.target.value)} className="field w-52" aria-label="Time period">
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />
      <div className="space-y-4 px-4 py-4 lg:px-6">
        {query.isLoading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6" role="status" aria-label="Loading">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-24 rounded-xl" />
            ))}
          </div>
        )}

        {query.isError && (
          <section className="card flex items-start gap-3 p-5">
            <Plug className="mt-0.5 h-5 w-5 shrink-0 text-gold-dark" />
            <div>
              <h2 className="text-sm font-bold text-navy">Plivo isn’t giving us call records yet</h2>
              <p className="mt-1 text-[13px] text-ink">{query.error instanceof ApiError ? query.error.message : "Something went wrong. Try again."}</p>
              <p className="mt-2 text-[12px] text-muted">
                An admin sets <code>PLIVO_AUTH_ID</code> and <code>PLIVO_AUTH_TOKEN</code> in the server’s environment (both are on the Plivo console home page), then restarts the backend.
              </p>
            </div>
          </section>
        )}

        {d && (
          <>
            {d.partial && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> There are more calls in this period than can be read at once, so these numbers cover only the newest ones. Pick a shorter period for exact figures.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Tile icon={Phone} label="Calls" value={String(d.totals.calls)} />
              <Tile icon={PhoneOutgoing} label="Answered" value={String(d.totals.answered)} hint={`${d.totals.answerRate}% pick-up rate`} />
              <Tile icon={PhoneMissed} label="Not answered" value={String(d.totals.unanswered)} />
              <Tile icon={Clock} label="Talk time" value={formatDuration(d.totals.totalSeconds)} />
              <Tile icon={PhoneIncoming} label="Average call" value={formatDuration(d.totals.avgSeconds)} hint="answered calls only" />
              <Tile icon={Wallet} label="Plivo cost" value={d.totals.cost.toLocaleString("en-IN", { maximumFractionDigits: 2 })} hint="in your Plivo currency" />
            </div>

            {d.totals.calls === 0 ? (
              <section className="card flex flex-col items-center gap-2 p-10 text-center">
                <PhoneOff className="h-6 w-6 text-muted" />
                <p className="text-[13px] text-muted">No calls on the Plivo number in this period.</p>
              </section>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  <ChartCard title={d.grain === "day" ? "Calls per day" : "Calls per month"} note="Hover a column to see how many were answered" className="lg:col-span-2">
                    <ColumnChart
                      months={d.series.map((r) => r.key)}
                      labels={d.series.map((r) => r.label)}
                      values={d.series.map((r) => r.calls)}
                      tips={d.series.map((r) => `${r.answered} answered`)}
                      tickLabel={seriesTick}
                      unit={["call", "calls"]}
                      ariaLabel="Calls per period"
                    />
                  </ChartCard>
                  <ChartCard title="Answered or not">
                    <DonutChart
                      ariaLabel="Answered and unanswered calls"
                      centreLabel="Pick-up rate"
                      centreValue={`${d.totals.answerRate}%`}
                      slices={[
                        { key: "a", label: "Answered", value: d.totals.answered },
                        { key: "u", label: "Not answered", value: d.totals.unanswered },
                      ]}
                    />
                  </ChartCard>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <ChartCard title="Outgoing and incoming">
                    <DonutChart
                      ariaLabel="Outgoing and incoming calls"
                      centreLabel="Calls"
                      centreValue={String(d.totals.calls)}
                      slices={d.byDirection.map((x) => ({ key: x.direction, label: x.direction === "outbound" ? "Outgoing" : "Incoming", value: x.calls }))}
                    />
                  </ChartCard>
                  <ChartCard title="Busiest hours" note="India time, working hours only" className="lg:col-span-2">
                    <HBarChart
                      ariaLabel="Calls by hour of day"
                      color={SERIES[0]}
                      rows={d.byHour
                        .filter((h) => h.hour >= 8 && h.hour <= 21)
                        .map((h) => ({ key: String(h.hour), label: hourLabel(h.hour), value: h.calls, display: String(h.calls), sub: `${h.answered} answered` }))}
                    />
                  </ChartCard>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="card p-5">
                    <h2 className="text-sm font-bold text-navy">Numbers called most</h2>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-[13px]">
                        <thead className="text-[11px] tracking-wide text-muted uppercase">
                          <tr>
                            <th className="pb-2 font-bold">Number</th>
                            <th className="pb-2 text-right font-bold">Calls</th>
                            <th className="pb-2 text-right font-bold">Answered</th>
                            <th className="pb-2 text-right font-bold">Talk time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.topNumbers.map((n) => (
                            <tr key={n.number} className="border-t border-line/70">
                              <td className="py-2 font-semibold text-navy">{formatPhone(n.number.replace(/^\+?91(?=\d{10}$)/, ""))}</td>
                              <td className="py-2 text-right">{n.calls}</td>
                              <td className="py-2 text-right">{n.answered}</td>
                              <td className="py-2 text-right">{formatDuration(n.seconds)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <ChartCard title="How calls ended" note="Plivo’s own reason for each call">
                    <HBarChart
                      ariaLabel="Calls by how they ended"
                      color={SERIES[1]}
                      rows={d.byOutcome.slice(0, 8).map((o) => ({ key: o.cause, label: o.cause, value: o.calls, display: String(o.calls) }))}
                    />
                  </ChartCard>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
