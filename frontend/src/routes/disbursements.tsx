import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Search } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { downloadReport } from "../lib/download-report";
import { formatAmount, formatDate } from "../lib/format";
import type { DisbursementRow, Paginated } from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { DatePicker } from "../components/date-picker";

type Result = Paginated<DisbursementRow> & { totalAmount: string | number };

export function DisbursementsPage() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = useQuery({
    queryKey: ["disbursements", { search, from, to }],
    queryFn: () =>
      api<Result>(
        `/disbursements${qs({
          search,
          from: from || undefined,
          to: to || undefined,
        })}`,
      ),
  });

  return (
    <>
      <PageHeader
        title="Disbursements"
        subtitle={
          query.data
            ? `${query.data.total} payouts · ${formatAmount(query.data.totalAmount)} released`
            : "Every payout, full and part"
        }
        actions={
          <button
            onClick={() => void downloadReport("disbursements", { q: search, from: from || undefined, to: to || undefined })}
            className="btn-ghost"
          >
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
              No disbursements in this range.
            </p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Date</th>
                  <th className="px-4 py-2.5 font-bold">Application</th>
                  <th className="px-4 py-2.5 font-bold">Applicant</th>
                  <th className="px-4 py-2.5 font-bold">Lender</th>
                  <th className="px-4 py-2.5 font-bold">Amount</th>
                  <th className="px-4 py-2.5 font-bold">Balance</th>
                  <th className="px-4 py-2.5 font-bold">UTR</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-line/70 last:border-0 hover:bg-bg-light/70"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(d.disbursedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to="/applications/$applicationId"
                        params={{ applicationId: d.application.id }}
                        className="font-semibold text-navy hover:text-gold-dark"
                      >
                        {d.application.applicationNo}
                      </Link>
                      <p className="text-[12px] text-muted">{d.application.loanProduct?.name}</p>
                    </td>
                    <td className="px-4 py-3">{d.application.applicants[0]?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{d.application.lender?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">
                      {formatAmount(d.amount)}
                      <span
                        className={clsx(
                          "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                          d.type === "FULL"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-sky-50 text-sky-700",
                        )}
                      >
                        {d.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{formatAmount(d.runningBalance)}</td>
                    <td className="px-4 py-3 text-muted">{d.utrNo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
