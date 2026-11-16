import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { formatPhone } from "../lib/whatsapp";
import { PageHeader } from "../components/app-shell";
import { TableSkeleton } from "../components/skeleton";

type Row = { id: string; receivedAt: string; phone: string | null; status: string | null; durationSec: number | null; outcome: string; leadId: string | null; summary: string | null; hasRecording: boolean; lead: { id: string; leadNo: number; name: string } | null };
type Result = { items: Row[]; total: number; page: number; pageSize: number; counts: Record<string, number> };
type Detail = Row & { transcript: string | null; error: string | null; recordingUrl: string | null };

const OUTCOME: Record<string, { label: string; tone: string }> = {
  LEAD_CREATED: { label: "New lead", tone: "bg-emerald-50 text-emerald-700" },
  LEAD_UPDATED: { label: "Added to a lead", tone: "bg-sky-50 text-sky-700" },
  NO_LEAD: { label: "No lead made", tone: "bg-slate-100 text-slate-600" },
  ERROR: { label: "Error", tone: "bg-red-50 text-red-700" },
};
const mins = (s: number | null) => (s === null ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);
const outcomeOf = (o: string) => OUTCOME[o] ?? { label: o, tone: "bg-slate-100 text-slate-600" };

export function VoiceCallsPage() {
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["voice-calls", { search, outcome, page }], queryFn: () => api<Result>(`/voice-calls${qs({ search, outcome, page })}`) });
  const detail = useQuery({ queryKey: ["voice-call", open], enabled: Boolean(open), queryFn: () => api<Detail>(`/voice-calls/${open}`) });
  const d = query.data;
  const pages = d ? Math.max(Math.ceil(d.total / d.pageSize), 1) : 1;

  return (
    <>
      <PageHeader title="Voice calls" subtitle="Every call the AI phone agent handled: what was said, and the lead it made" />
      <div className="px-4 py-4 lg:px-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Phone number or words said" className="field w-64 pl-9" />
          </div>
          <select value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }} className="field w-52">
            <option value="">Any result</option>
            {Object.entries(OUTCOME).map(([k, v]) => (
              <option key={k} value={k}>{v.label}{d?.counts[k] ? ` (${d.counts[k]})` : ""}</option>
            ))}
          </select>
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">{(query.error as Error).message}</p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">No calls yet. They appear here as the voice agent finishes each call.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">When</th>
                  <th className="px-4 py-2.5 font-bold">Caller</th>
                  <th className="px-4 py-2.5 font-bold">Length</th>
                  <th className="px-4 py-2.5 font-bold">Result</th>
                  <th className="px-4 py-2.5 font-bold">Lead</th>
                  <th className="px-4 py-2.5 font-bold">What happened</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((c) => (
                  <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer border-b border-line/70 align-top last:border-0 hover:bg-bg-light/60">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(c.receivedAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{c.phone ? formatPhone(c.phone) : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{mins(c.durationSec)}{c.hasRecording ? " 🎧" : ""}</td>
                    <td className="px-4 py-3"><span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", outcomeOf(c.outcome).tone)}>{outcomeOf(c.outcome).label}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.lead ? (
                        <Link to="/leads/$leadId" params={{ leadId: c.lead.id }} onClick={(e) => e.stopPropagation()} className="font-semibold text-navy underline">#{c.lead.leadNo} {c.lead.name}</Link>
                      ) : "—"}
                    </td>
                    <td className="max-w-md px-4 py-3 text-muted">{c.summary ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {d && pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
            <span>{d.total} calls</span>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="self-center">Page {page} of {pages}</span>
              <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(null)}>
          <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-navy">Call {detail.data?.phone ? formatPhone(detail.data.phone) : ""}</h2>
                {detail.data && <p className="text-[12px] text-muted">{formatDateTime(detail.data.receivedAt)} · {mins(detail.data.durationSec)}</p>}
              </div>
              <button className="btn-ghost" onClick={() => setOpen(null)} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            {detail.isPending ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : detail.isError ? (
              <p className="text-sm text-red-600">{(detail.error as Error).message}</p>
            ) : (
              <div className="space-y-4 text-[13px]">
                {detail.data.lead && (
                  <p>Lead: <Link to="/leads/$leadId" params={{ leadId: detail.data.lead.id }} className="font-semibold text-navy underline">#{detail.data.lead.leadNo} {detail.data.lead.name}</Link></p>
                )}
                {detail.data.error && <p className="rounded-md bg-red-50 px-3 py-2 text-red-800">{detail.data.error}</p>}
                <section>
                  <h3 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Recording</h3>
                  {detail.data.recordingUrl ? (
                    <div className="space-y-1">
                      <audio controls src={detail.data.recordingUrl} className="w-full" />
                      <a href={detail.data.recordingUrl} target="_blank" rel="noreferrer" className="text-[12px] text-navy underline">Open the recording</a>
                    </div>
                  ) : (
                    <p className="text-muted">No recording came with this call. Turn on call recording in the voice agent's settings and later calls will carry one.</p>
                  )}
                </section>
                <section>
                  <h3 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Summary</h3>
                  <p>{detail.data.summary ?? "—"}</p>
                </section>
                <section>
                  <h3 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">What was said</h3>
                  {detail.data.transcript ? (
                    <div className="space-y-1.5 rounded-lg border border-line p-3">
                      {detail.data.transcript.split("\n").map((l, i) => {
                        const agent = /^agent\s*:/i.test(l);
                        return <p key={i} className={agent ? "text-navy" : "text-ink"}><strong>{agent ? "Agent" : "Caller"}:</strong> {l.replace(/^[^:]*:\s*/, "")}</p>;
                      })}
                    </div>
                  ) : (
                    <p className="text-muted">No transcript.</p>
                  )}
                </section>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
