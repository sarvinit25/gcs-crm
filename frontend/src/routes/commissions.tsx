import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, Loader2, Search } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { downloadReport } from "../lib/download-report";
import { formatAmount, formatDate } from "../lib/format";
import type { CommissionRow, Paginated, PayoutStatus } from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { DatePicker } from "../components/date-picker";

type Result = Paginated<CommissionRow> & { totalAmount: string | number };

const STATUS_STYLE: Record<PayoutStatus, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  PARTIAL: "bg-sky-50 text-sky-700",
  PAID: "bg-emerald-50 text-emerald-700",
};

const nextStatus = (status: PayoutStatus): PayoutStatus =>
  status === "PENDING" ? "PARTIAL" : status === "PARTIAL" ? "PAID" : "PENDING";

export function CommissionsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["commissions", { search, status, from, to }],
    queryFn: () =>
      api<Result>(
        `/commissions${qs({
          search,
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
        })}`,
      ),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["commissions"] });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PayoutStatus }) =>
      api(`/commissions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
  });

  const updateSplitStatus = useMutation({
    mutationFn: ({ id, splitId, status }: { id: string; splitId: string; status: PayoutStatus }) =>
      api(`/commissions/${id}/splits/${splitId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: invalidate,
  });

  const exportReport = () =>
    void downloadReport("commissions", { q: search, status: status || undefined, from: from || undefined, to: to || undefined });

  return (
    <>
      <PageHeader
        title="Commissions"
        subtitle={
          query.data
            ? `${query.data.total} entries · ${formatAmount(query.data.totalAmount)} gross`
            : "Ledger per disbursed case, split across every stakeholder"
        }
        actions={
          <button onClick={exportReport} className="btn-ghost">
            <Download className="h-4 w-4" /> Export
          </button>
        }
      />

      <div className="px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Application no or applicant"
              className="field w-64 pl-9"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field w-36">
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
          </select>
          <DatePicker value={from} onChange={setFrom} max={to || undefined} className="w-44" title="From" placeholder="From date" />
          <DatePicker value={to} onChange={setTo} min={from || undefined} className="w-44" title="To" placeholder="To date" />
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">
              {(query.error as Error).message}
            </p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">
              No commissions recorded yet — add one from a disbursed application.
            </p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="px-4 py-2.5 font-bold">Application</th>
                  <th className="px-4 py-2.5 font-bold">Applicant</th>
                  <th className="px-4 py-2.5 font-bold">Lender</th>
                  <th className="px-4 py-2.5 font-bold">Gross</th>
                  <th className="px-4 py-2.5 font-bold">Rate</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((c) => {
                  const isOpen = expanded === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                        className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-bg-light/70"
                      >
                        <td className="px-2 py-3 text-muted">
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to="/applications/$applicationId"
                            params={{ applicationId: c.disbursement.application.id }}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-navy hover:text-gold-dark"
                          >
                            {c.disbursement.application.applicationNo}
                          </Link>
                          <p className="text-[12px] text-muted">
                            {c.disbursement.application.loanProduct?.name}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {c.disbursement.application.applicants[0]?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {c.disbursement.application.lender?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-medium">{formatAmount(c.grossAmount)}</td>
                        <td className="px-4 py-3 text-muted">{c.grossRate}%</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus.mutate({ id: c.id, status: nextStatus(c.status) });
                            }}
                            title="Click to advance status"
                            className={clsx(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold",
                              STATUS_STYLE[c.status],
                            )}
                          >
                            {c.status}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-line/70 bg-bg-light/40 last:border-0">
                          <td />
                          <td colSpan={6} className="px-4 py-3">
                            <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                              Disbursed {formatAmount(c.disbursement.amount)} on{" "}
                              {formatDate(c.disbursement.disbursedAt)}
                            </p>
                            {!c.splits.length ? (
                              <p className="text-[12px] text-muted">No splits recorded.</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {c.splits.map((s) => (
                                  <li
                                    key={s.id}
                                    className="flex items-center justify-between gap-2 text-[12px]"
                                  >
                                    <span className="text-muted">
                                      {s.stakeholderRole && (
                                        <span className="mr-1 rounded bg-navy/5 px-1.5 py-0.5 text-[10px] font-bold text-navy">
                                          {s.stakeholderRole}
                                        </span>
                                      )}
                                      {s.user?.name ?? s.sourcingPartner?.name ?? "—"} ·{" "}
                                      {s.sharePercent}% · {formatAmount(s.amount)}
                                    </span>
                                    <button
                                      onClick={() =>
                                        updateSplitStatus.mutate({
                                          id: c.id,
                                          splitId: s.id,
                                          status: nextStatus(s.status),
                                        })
                                      }
                                      className={clsx(
                                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                        STATUS_STYLE[s.status],
                                      )}
                                    >
                                      {s.status}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
