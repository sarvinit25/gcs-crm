import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { TRIGGER_LABEL, formatPhone, type NotificationLog, type Trigger } from "../lib/whatsapp";
import { PageHeader } from "../components/app-shell";
import { TableSkeleton } from "../components/skeleton";

type Result = { items: NotificationLog[]; total: number; page: number; pageSize: number; counts: Partial<Record<NotificationLog["status"], number>> };

const TONE = {
  SENT: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  SKIPPED: "bg-slate-100 text-slate-600",
} as const;

const STATUSES = ["SENT", "FAILED", "SKIPPED"] as const;

export function NotificationLogsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [trigger, setTrigger] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["wa-logs", { search, status, trigger, page }],
    queryFn: () => api<Result>(`/notifications/logs${qs({ search, status, trigger, page })}`),
  });
  const d = query.data;
  const pages = d ? Math.max(Math.ceil(d.total / d.pageSize), 1) : 1;

  return (
    <>
      <PageHeader title="Notification logs" subtitle="Every automatic message — sent, failed, or held back, and why" />
      <div className="px-4 py-4 lg:px-6">
        <div className="mb-3 grid grid-cols-3 gap-3">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(status === s ? "" : s);
                setPage(1);
              }}
              className={clsx("card p-3 text-left transition", status === s && "ring-2 ring-gold")}
            >
              <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{s === "SENT" ? "Sent" : s === "FAILED" ? "Failed" : "Not sent"}</p>
              <p className="mt-0.5 text-lg font-bold text-navy">{d?.counts[s] ?? 0}</p>
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name or phone" className="field w-64 pl-9" />
          </div>
          <select value={trigger} onChange={(e) => { setTrigger(e.target.value); setPage(1); }} className="field w-52">
            <option value="">Any trigger</option>
            {(Object.keys(TRIGGER_LABEL) as Trigger[]).map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">{(query.error as Error).message}</p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">Nothing here yet. Messages appear as leads and files move.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">When</th>
                  <th className="px-4 py-2.5 font-bold">Trigger</th>
                  <th className="px-4 py-2.5 font-bold">To</th>
                  <th className="px-4 py-2.5 font-bold">Template</th>
                  <th className="px-4 py-2.5 font-bold">Result</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((l) => (
                  <tr key={l.id} className="border-b border-line/70 align-top last:border-0 hover:bg-bg-light/60">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</td>
                    <td className="px-4 py-3">{TRIGGER_LABEL[l.trigger]}</td>
                    <td className="px-4 py-3">
                      {l.toName && <p className="font-semibold text-navy">{l.toName}</p>}
                      <p className="text-[12px] text-muted">
                        {l.toPhone ? formatPhone(l.toPhone) : "—"} · {l.recipient === "CUSTOMER" ? "customer" : "team"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted">{l.templateCode ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold", TONE[l.status])}>{l.status === "SKIPPED" ? "NOT SENT" : l.status}</span>
                      {l.reason && <p className="mt-1 max-w-sm text-[12px] text-muted">{l.reason}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {d && pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
            <span>{d.total} entries</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-ghost">
                Previous
              </button>
              <span>
                Page {page} of {pages}
              </span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="btn-ghost">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
