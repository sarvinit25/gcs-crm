import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { api, qs } from "../lib/api";
import { formatAmount, formatDate } from "../lib/format";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  type Application,
  type Paginated,
} from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { ApplicationStatusBadge } from "../components/status-badge";

export function ApplicationsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["applications", { search, status, page }],
    queryFn: () => api<Paginated<Application>>(`/applications${qs({ search, status, page })}`),
  });

  return (
    <>
      <PageHeader
        title="Applications"
        subtitle={query.data ? `${query.data.total} total` : "Case files, lead to disbursal"}
      />

      <div className="px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Application no, name or phone"
              className="field w-72 pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="field w-44"
          >
            <option value="">All statuses</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="card overflow-hidden">
          {query.isPending ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading applications…
            </div>
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">
              {(query.error as Error).message}
            </p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">
              No applications yet — raise one from a lead.
            </p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Application</th>
                  <th className="px-4 py-2.5 font-bold">Applicant</th>
                  <th className="px-4 py-2.5 font-bold">Product</th>
                  <th className="px-4 py-2.5 font-bold">Amount</th>
                  <th className="px-4 py-2.5 font-bold">Lender</th>
                  <th className="px-4 py-2.5 font-bold">Owner</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((app) => (
                  <tr
                    key={app.id}
                    className="border-b border-line/70 last:border-0 hover:bg-bg-light/70"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/applications/$applicationId"
                        params={{ applicationId: app.id }}
                        className="font-semibold text-navy hover:text-gold-dark"
                      >
                        {app.applicationNo}
                      </Link>
                      <p className="text-[12px] text-muted">{formatDate(app.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">{app.applicants[0]?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{app.loanProduct?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{formatAmount(app.requestedAmount)}</td>
                    <td className="px-4 py-3 text-muted">
                      {app.lender?.name ?? <span className="text-amber-600">Not assigned</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{app.owner?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <ApplicationStatusBadge status={app.status} />
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
