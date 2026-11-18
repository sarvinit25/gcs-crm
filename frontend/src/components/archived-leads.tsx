import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, Banknote, CheckCircle2, Clock, Loader2, Search, XCircle } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatAmount, formatCompact, formatDate, initials } from "../lib/format";
import { useAuth } from "../lib/auth";
import { convertedShare, daysLabel, type ArchivedLead, type ArchivedResult } from "../lib/archived-leads";
import { PageHeader } from "./app-shell";
import { ExportMenu } from "./export-menu";
import { LeadStatusBadge } from "./status-badge";
import { TableSkeleton } from "./skeleton";
import { ChartCard, HBarChart } from "./charts";

function Tile({ icon: Icon, label, value, hint, tint, edge }: { icon: typeof Archive; label: string; value: React.ReactNode; hint?: string; tint: string; edge: string }) {
  return (
    <div className={clsx("card border-t-[3px] p-4", edge)}>
      <div className="flex items-center gap-3">
        <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tint)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
          <p className="text-xl font-bold text-navy">{value}</p>
        </div>
      </div>
      {hint && <p className="mt-2 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Archived leads: every converted or lost lead that was moved out of the working list, with the details staff go
 * looking for: when it came in and was archived, how long it took, who archived it, why it was lost, and the
 * application it became. Archiving never deletes anything; Restore puts a lead back.
 */
export function ArchivedLeads({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canRestore = user?.role !== "ADVISOR";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "CONVERTED" | "LOST">("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["leads", "archive", { search, status, page }],
    queryFn: () => api<ArchivedResult>(`/leads/archive${qs({ search: search || undefined, status: status || undefined, page })}`),
    placeholderData: (prev) => prev,
  });
  const restore = useMutation({
    mutationFn: (id: string) => api(`/leads/${id}/unarchive`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });
  const d = query.data;
  const s = d?.summary;
  const pages = d ? Math.max(Math.ceil(d.total / d.pageSize), 1) : 1;

  return (
    <>
      <PageHeader
        title="Archived leads"
        subtitle={s ? `${s.total} converted or lost lead${s.total === 1 ? "" : "s"} moved out of the working list` : "Converted and lost leads moved out of the working list"}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> Active leads
            </button>
            <ExportMenu type="leads" filters={{ archived: "true", q: search, status }} />
          </div>
        }
      />
      <div className="space-y-4 px-6 py-5">
        {s && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={Archive} label="Archived leads" value={s.total} tint="bg-slate-100 text-slate-600" edge="border-t-slate-400" hint={`${convertedShare(s)}% were converted`} />
            <Tile
              icon={CheckCircle2}
              label="Converted"
              value={s.converted}
              tint="bg-emerald-50 text-emerald-600"
              edge="border-t-emerald-500"
              hint={s.convertedAmount ? `${formatCompact(s.convertedAmount)} requested` : undefined}
            />
            <Tile icon={XCircle} label="Lost" value={s.lost} tint="bg-red-50 text-red-600" edge="border-t-red-500" hint={s.lostAmount ? `${formatCompact(s.lostAmount)} requested` : undefined} />
            <Tile icon={Clock} label="Average time" value={daysLabel(s.averageDays)} tint="bg-sky-50 text-sky-600" edge="border-t-sky-500" hint="From enquiry to archive" />
          </div>
        )}

        {s && s.lost > 0 && (
          <ChartCard title="Why leads were lost" note="Reasons recorded on lost leads, most common first" className="max-w-2xl">
            <HBarChart ariaLabel="Lost leads by reason" color="#e34948" rows={s.lostReasons.map((r) => ({ key: r.reason, label: r.reason, value: r.count, display: String(r.count) }))} />
          </ChartCard>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Name, phone or email"
              className="field w-72 pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
            className="field w-44"
            aria-label="Result"
          >
            <option value="">Converted and lost</option>
            <option value="CONVERTED">Converted</option>
            <option value="LOST">Lost</option>
          </select>
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : query.isError ? (
            <p className="py-12 text-center text-sm text-red-600">{(query.error as Error).message}</p>
          ) : d!.items.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted">
              <Archive className="mx-auto mb-2 h-6 w-6 text-muted/50" />
              {search || status ? "No archived leads match." : "Nothing is archived yet. A converted or lost lead can be archived from its page, and it appears here."}
            </div>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Lead</th>
                  <th className="px-4 py-2.5 font-bold">Loan</th>
                  <th className="px-4 py-2.5 font-bold">Source</th>
                  <th className="px-4 py-2.5 font-bold">Owner</th>
                  <th className="px-4 py-2.5 font-bold">Result</th>
                  <th className="px-4 py-2.5 font-bold">Came in</th>
                  <th className="px-4 py-2.5 font-bold">Archived</th>
                  <th className="px-4 py-2.5 font-bold">Took</th>
                  <th className="px-4 py-2.5 font-bold">Application</th>
                  {canRestore && <th className="px-4 py-2.5" aria-label="Restore" />}
                </tr>
              </thead>
              <tbody>
                {d!.items.map((l: ArchivedLead) => (
                  <tr key={l.id} className="border-b border-line/70 align-top last:border-0 hover:bg-bg-light/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy/10 text-[11px] font-bold text-navy">{initials(l.name)}</span>
                        <div>
                          <Link to="/leads/$leadId" params={{ leadId: l.id }} className="font-semibold text-navy hover:underline">
                            {l.name}
                          </Link>
                          <p className="text-[12px] text-muted">
                            #{l.leadNo} · {l.phone}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{l.loanProduct?.name ?? "—"}</p>
                      <p className="text-[12px] text-muted">{l.amount ? formatAmount(l.amount) : "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{l.source}</td>
                    <td className="px-4 py-3 text-muted">{l.assignedOfficer?.name ?? "Nobody"}</td>
                    <td className="px-4 py-3">
                      <LeadStatusBadge status={l.status} />
                      {l.status === "LOST" && <p className="mt-1 max-w-48 text-[12px] break-words whitespace-normal text-muted">{l.lostReason || "No reason recorded"}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(l.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-ink">{formatDate(l.archivedAt)}</p>
                      <p className="text-[12px] text-muted">{l.archivedByName ? `by ${l.archivedByName}` : ""}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{daysLabel(l.daysInPipeline)}</td>
                    <td className="px-4 py-3">
                      {l.application ? (
                        <Link to="/applications/$applicationId" params={{ applicationId: l.application.id }} className="inline-flex items-center gap-1 font-semibold text-navy hover:underline">
                          <Banknote className="h-3.5 w-3.5 text-gold-dark" /> {l.application.applicationNo}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {canRestore && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => restore.mutate(l.id)}
                          disabled={restore.isPending}
                          className="btn-ghost px-2.5 py-1.5 text-[12px]"
                          title="Put this lead back in the working list"
                        >
                          {restore.isPending && restore.variables === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />} Restore
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {d && d.total > d.pageSize && (
          <div className="flex items-center justify-between text-[13px] text-muted">
            <span>
              Showing {(d.page - 1) * d.pageSize + 1} to {Math.min(d.page * d.pageSize, d.total)} of {d.total} archived leads
            </span>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
