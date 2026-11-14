import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Download, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Plug, RefreshCw, SlidersHorizontal, Wallet } from "lucide-react";
import clsx from "clsx";
import { api, ApiError, qs } from "../lib/api";
import { formatPhone } from "../lib/whatsapp";
import {
  DEFAULT_PREFS,
  SECTION_LABEL,
  buildCsv,
  formatDuration,
  hourLabel,
  loadPrefs,
  sanitizePrefs,
  savePrefs,
  seriesTick,
  type Prefs,
  type SectionKey,
  type TelephonyStats,
} from "../lib/telephony";
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

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[12px] font-semibold text-navy">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

const DIRECTIONS: { value: Prefs["direction"]; label: string }[] = [
  { value: "all", label: "All calls" },
  { value: "outbound", label: "Outgoing" },
  { value: "inbound", label: "Incoming" },
];

const hours = Array.from({ length: 24 }, (_, h) => h);

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function TelephonyPage() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [open, setOpen] = useState(false);
  const change = (patch: Partial<Prefs>) => setPrefs((p) => sanitizePrefs({ ...p, ...patch }));
  useEffect(() => savePrefs(prefs), [prefs]);

  const periods = usePeriods();
  const options = (periods.data ?? [{ value: "30d", label: "Last 30 days" }]).filter((o) => o.value !== "all");
  const custom = prefs.range === "custom";
  const ready = !custom || Boolean(prefs.from && prefs.to);

  const query = useQuery({
    queryKey: ["telephony-stats", prefs.range, prefs.from, prefs.to, prefs.direction, prefs.minSeconds, prefs.top],
    queryFn: () =>
      api<TelephonyStats>(
        `/telephony/stats${qs({
          ...(custom ? { from: prefs.from, to: prefs.to } : { range: prefs.range }),
          direction: prefs.direction,
          minSeconds: prefs.minSeconds,
          top: prefs.top,
        })}`,
      ),
    enabled: ready,
    retry: false,
    staleTime: 60_000,
    refetchInterval: prefs.autoMinutes ? prefs.autoMinutes * 60_000 : false,
  });
  const d = query.data;
  const money = (n: number) => `${prefs.currency}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const showDirection = prefs.show.direction && prefs.direction === "all";
  const tiles = prefs.show.cost ? "lg:grid-cols-6" : "lg:grid-cols-5";

  return (
    <>
      <PageHeader
        title="Telecaller"
        subtitle="Calls made and received on the firm's Plivo number"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={prefs.range}
              onChange={(e) => change({ range: e.target.value })}
              className="field w-52"
              aria-label="Time period"
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="custom">Custom range…</option>
            </select>
            <button className="btn-ghost" onClick={() => void query.refetch()} disabled={!ready || query.isFetching} title="Fetch the latest calls from Plivo">
              <RefreshCw className={clsx("h-4 w-4", query.isFetching && "animate-spin")} /> Refresh
            </button>
            <button className="btn-ghost" onClick={() => d && download(`telecaller-${d.from.slice(0, 10)}-to-${d.to.slice(0, 10)}.csv`, buildCsv(d))} disabled={!d} title="Download this view as a spreadsheet file">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button className="btn-ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <SlidersHorizontal className="h-4 w-4" /> Customise
            </button>
          </div>
        }
      />
      <div className="space-y-4 px-4 py-4 lg:px-6">
        {custom && (
          <div className="card flex flex-wrap items-end gap-3 p-4">
            <Setting label="From">
              <input type="date" className="field" value={prefs.from} max={prefs.to || undefined} onChange={(e) => change({ from: e.target.value })} />
            </Setting>
            <Setting label="To">
              <input type="date" className="field" value={prefs.to} min={prefs.from || undefined} onChange={(e) => change({ to: e.target.value })} />
            </Setting>
            {!ready && <p className="pb-2 text-[12px] text-muted">Pick both dates to see the calls.</p>}
          </div>
        )}

        {open && (
          <section className="card space-y-4 p-5" aria-label="Customise this page">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-navy">Customise</h2>
              <button className="text-[12px] font-semibold text-navy underline" onClick={() => setPrefs(DEFAULT_PREFS)}>
                Reset to default
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Setting label="Which calls">
                <div className="flex overflow-hidden rounded-lg border border-line">
                  {DIRECTIONS.map((x) => (
                    <button
                      key={x.value}
                      onClick={() => change({ direction: x.value })}
                      className={clsx("flex-1 px-2 py-1.5 text-[12px] font-semibold", prefs.direction === x.value ? "bg-navy text-white" : "bg-white text-navy")}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </Setting>
              <Setting label="Counts as answered after">
                <select className="field w-full" value={prefs.minSeconds} onChange={(e) => change({ minSeconds: Number(e.target.value) })}>
                  {[1, 5, 10, 20, 30, 60].map((s) => (
                    <option key={s} value={s}>
                      {s === 1 ? "Any connection" : `${s} seconds of talk`}
                    </option>
                  ))}
                </select>
              </Setting>
              <Setting label="Numbers in “called most”">
                <select className="field w-full" value={prefs.top} onChange={(e) => change({ top: Number(e.target.value) })}>
                  {[5, 10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      Top {n}
                    </option>
                  ))}
                </select>
              </Setting>
              <Setting label="Refresh by itself">
                <select className="field w-full" value={prefs.autoMinutes} onChange={(e) => change({ autoMinutes: Number(e.target.value) })}>
                  <option value={0}>Off</option>
                  <option value={1}>Every minute</option>
                  <option value={5}>Every 5 minutes</option>
                  <option value={15}>Every 15 minutes</option>
                </select>
              </Setting>
              <Setting label="Working hours start">
                <select className="field w-full" value={prefs.hourFrom} onChange={(e) => change({ hourFrom: Number(e.target.value) })}>
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </Setting>
              <Setting label="Working hours end">
                <select className="field w-full" value={prefs.hourTo} onChange={(e) => change({ hourTo: Number(e.target.value) })}>
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </Setting>
              <Setting label="Currency sign for cost">
                <select className="field w-full" value={prefs.currency} onChange={(e) => change({ currency: e.target.value })}>
                  <option value="">None</option>
                  <option value="₹">₹ Rupee</option>
                  <option value="$">$ Dollar</option>
                  <option value="€">€ Euro</option>
                  <option value="£">£ Pound</option>
                </select>
              </Setting>
            </div>
            <fieldset>
              <legend className="text-[12px] font-semibold text-navy">Show on the page</legend>
              <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
                {(Object.keys(SECTION_LABEL) as SectionKey[]).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-[13px] text-ink">
                    <input type="checkbox" checked={prefs.show[k]} onChange={(e) => change({ show: { ...prefs.show, [k]: e.target.checked } })} />
                    {SECTION_LABEL[k]}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-[12px] text-muted">These settings are remembered on this browser only.</p>
          </section>
        )}

        {ready && query.isLoading && (
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

            <div className={clsx("grid grid-cols-2 gap-3", tiles)}>
              <Tile icon={Phone} label="Calls" value={String(d.totals.calls)} hint={prefs.direction === "all" ? undefined : prefs.direction === "outbound" ? "outgoing only" : "incoming only"} />
              <Tile icon={PhoneOutgoing} label="Answered" value={String(d.totals.answered)} hint={`${d.totals.answerRate}% pick-up rate`} />
              <Tile icon={PhoneMissed} label="Not answered" value={String(d.totals.unanswered)} hint={prefs.minSeconds > 1 ? `under ${prefs.minSeconds}s counts as missed` : undefined} />
              <Tile icon={Clock} label="Talk time" value={formatDuration(d.totals.totalSeconds)} />
              <Tile icon={PhoneIncoming} label="Average call" value={formatDuration(d.totals.avgSeconds)} hint="answered calls only" />
              {prefs.show.cost && <Tile icon={Wallet} label="Plivo cost" value={money(d.totals.cost)} hint={prefs.currency ? undefined : "in your Plivo currency"} />}
            </div>
            <p className="text-[12px] text-muted">Updated {new Date(query.dataUpdatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</p>

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

                {(showDirection || prefs.show.hours) && (
                  <div className="grid gap-4 lg:grid-cols-3">
                    {showDirection && (
                      <ChartCard title="Outgoing and incoming">
                        <DonutChart
                          ariaLabel="Outgoing and incoming calls"
                          centreLabel="Calls"
                          centreValue={String(d.totals.calls)}
                          slices={d.byDirection.map((x) => ({ key: x.direction, label: x.direction === "outbound" ? "Outgoing" : "Incoming", value: x.calls }))}
                        />
                      </ChartCard>
                    )}
                    {prefs.show.hours && (
                      <ChartCard title="Busiest hours" note={`India time, ${hourLabel(prefs.hourFrom)} to ${hourLabel(prefs.hourTo)}`} className={showDirection ? "lg:col-span-2" : "lg:col-span-3"}>
                        <HBarChart
                          ariaLabel="Calls by hour of day"
                          color={SERIES[0]}
                          rows={d.byHour
                            .filter((h) => h.hour >= prefs.hourFrom && h.hour <= prefs.hourTo)
                            .map((h) => ({ key: String(h.hour), label: hourLabel(h.hour), value: h.calls, display: String(h.calls), sub: `${h.answered} answered` }))}
                        />
                      </ChartCard>
                    )}
                  </div>
                )}

                {(prefs.show.numbers || prefs.show.outcomes) && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {prefs.show.numbers && (
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
                    )}
                    {prefs.show.outcomes && (
                      <ChartCard title="How calls ended" note="Plivo’s own reason for each call" className={prefs.show.numbers ? undefined : "lg:col-span-2"}>
                        <HBarChart
                          ariaLabel="Calls by how they ended"
                          color={SERIES[1]}
                          rows={d.byOutcome.slice(0, 8).map((o) => ({ key: o.cause, label: o.cause, value: o.calls, display: String(o.calls) }))}
                        />
                      </ChartCard>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
