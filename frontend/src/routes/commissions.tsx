import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { ExportMenu } from "../components/export-menu";
import { formatAmount, formatDate } from "../lib/format";
import {
  COMMISSION_STATUS_LABEL,
  EXTRA_SOURCE_LABEL,
  type CommissionRow,
  type CommissionSummary,
  type Paginated,
  type PayoutStatus,
} from "../lib/types";
import { STATUS_STYLE } from "../components/commission-block";
import { PageHeader } from "../components/app-shell";
import { DatePicker } from "../components/date-picker";
import { TableSkeleton } from "../components/skeleton";

type Result = Paginated<CommissionRow> & { totalAmount: string | number; summary: CommissionSummary };

/** Splits move pending → part → paid; the lender's commission goes through claim and receipt instead. */
const nextStatus = (status: PayoutStatus): PayoutStatus =>
  status === "PENDING" ? "PARTIAL" : status === "PARTIAL" ? "PAID" : "PENDING";

const STAGES: PayoutStatus[] = ["PENDING", "CLAIMED", "PARTIAL", "PAID"];

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

  const claim = useMutation({
    mutationFn: (id: string) => api(`/commissions/${id}/claim`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: invalidate,
  });

  const receive = useMutation({
    mutationFn: (id: string) => api(`/commissions/${id}/receive`, { method: "POST", body: JSON.stringify({}) }),
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
          <ExportMenu type="commissions" filters={{ q: search, status: status || undefined, from: from || undefined, to: to || undefined }} />
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
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field w-44">
            <option value="">All statuses</option>
            {STAGES.map((st) => (
              <option key={st} value={st}>
                {COMMISSION_STATUS_LABEL[st]}
              </option>
            ))}
          </select>
          <DatePicker value={from} onChange={setFrom} max={to || undefined} className="w-44" title="From" placeholder="From date" />
          <DatePicker value={to} onChange={setTo} min={from || undefined} className="w-44" title="To" placeholder="To date" />
        </div>

        {[claim, receive].find((m) => m.isError) && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {([claim, receive].find((m) => m.isError)?.error as Error).message}
          </p>
        )}

        {query.data && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAGES.map((st) => {
              const row = query.data.summary[st];
              return (
                <button
                  key={st}
                  onClick={() => setStatus(status === st ? "" : st)}
                  className={clsx(
                    "card p-3 text-left transition",
                    status === st && "ring-2 ring-gold",
                  )}
                >
                  <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
                    {COMMISSION_STATUS_LABEL[st]} · {row.count}
                  </p>
                  <p className="mt-0.5 text-[16px] font-bold text-navy">{formatAmount(row.amount)}</p>
                  {st === "PARTIAL" && row.received > 0 && (
                    <p className="text-[11px] text-muted">{formatAmount(row.received)} received so far</p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
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
                          <div className="flex items-center gap-1.5">
                            <span
                              className={clsx(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap",
                                STATUS_STYLE[c.status],
                              )}
                            >
                              {COMMISSION_STATUS_LABEL[c.status]}
                            </span>
                            {c.status === "PENDING" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  claim.mutate(c.id);
                                }}
                                className="text-[11px] font-semibold text-gold-dark hover:text-navy"
                              >
                                Claim
                              </button>
                            )}
                            {(c.status === "CLAIMED" || c.status === "PARTIAL") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const left =
                                    Number(c.grossAmount) - Number(c.receivedAmount ?? 0);
                                  if (window.confirm(`Mark ${formatAmount(left)} as received in full?`))
                                    receive.mutate(c.id);
                                }}
                                title="Record the whole outstanding amount as received — use the application page for a part payment"
                                className="text-[11px] font-semibold text-gold-dark hover:text-navy"
                              >
                                Received
                              </button>
                            )}
                          </div>
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
                            {c.extras.length > 0 && (
                              <p className="mb-2 text-[12px] text-muted">
                                Extras:{" "}
                                {c.extras
                                  .map(
                                    (e) =>
                                      `${EXTRA_SOURCE_LABEL[e.source]} ${formatAmount(e.amount)}${e.status === "PAID" ? " (received)" : ""}`,
                                  )
                                  .join(" · ")}
                              </p>
                            )}
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
