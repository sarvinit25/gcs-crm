import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Search } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatAmount, formatDate, isOverdue } from "../lib/format";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type Lead, type Paginated } from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { LeadStatusBadge } from "../components/status-badge";

export function LeadsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["leads", { search, status, dueOnly, page }],
    queryFn: () =>
      api<Paginated<Lead>>(
        `/leads${qs({ search, status, dueOnly: dueOnly ? "true" : undefined, page })}`,
      ),
  });

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={query.data ? `${query.data.total} total` : "Every enquiry, from any source"}
      />

      <div className="px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input
              value={search}
              onChange={(e) => reset(() => setSearch(e.target.value))}
              placeholder="Name, phone or email"
              className="field w-64 pl-9"
            />
          </div>

          <select
            value={status}
            onChange={(e) => reset(() => setStatus(e.target.value))}
            className="field w-40"
          >
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <button
            onClick={() => reset(() => setDueOnly(!dueOnly))}
            className={clsx("btn-ghost", dueOnly && "border-navy/40 bg-navy/5")}
          >
            <AlertCircle className="h-4 w-4" />
            Follow-up due
          </button>
        </div>

        <div className="card overflow-hidden">
          {query.isPending ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading leads…
            </div>
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">
              {(query.error as Error).message}
            </p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">No leads match these filters.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Lead</th>
                  <th className="px-4 py-2.5 font-bold">Product</th>
                  <th className="px-4 py-2.5 font-bold">Amount</th>
                  <th className="px-4 py-2.5 font-bold">Source</th>
                  <th className="px-4 py-2.5 font-bold">Owner</th>
                  <th className="px-4 py-2.5 font-bold">Follow-up</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((lead) => (
                  <tr key={lead.id} className="border-b border-line/70 last:border-0 hover:bg-bg-light/70">
                    <td className="px-4 py-3">
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: lead.id }}
                        className="font-semibold text-navy hover:text-gold-dark"
                      >
                        {lead.name}
                      </Link>
                      <p className="text-[12px] text-muted">
                        #{lead.leadNo} · {lead.phone}
                        {lead.city && ` · ${lead.city}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted">{lead.loanProduct?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{formatAmount(lead.amount)}</td>
                    <td className="px-4 py-3 text-muted">{lead.source}</td>
                    <td className="px-4 py-3 text-muted">
                      {lead.assignedOfficer?.name ?? (
                        <span className="text-amber-600">Unassigned</span>
                      )}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-3",
                        isOverdue(lead.nextFollowUpAt) ? "font-semibold text-red-600" : "text-muted",
                      )}
                    >
                      {formatDate(lead.nextFollowUpAt)}
                    </td>
                    <td className="px-4 py-3">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {query.data && query.data.total > query.data.pageSize && (
          <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
            <span>
              Page {query.data.page} of {Math.ceil(query.data.total / query.data.pageSize)}
            </span>
            <div className="flex gap-2">
              <button
                className="btn-ghost"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn-ghost"
                disabled={page >= Math.ceil(query.data.total / query.data.pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
