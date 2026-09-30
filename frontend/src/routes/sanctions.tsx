import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Search } from "lucide-react";
import { api, qs } from "../lib/api";
import { downloadReport } from "../lib/download-report";
import { formatAmount, formatDate } from "../lib/format";
import {
  SANCTION_STATUSES,
  SANCTION_STATUS_LABEL,
  type Paginated,
  type Sanction,
} from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { SanctionStatusBadge } from "../components/status-badge";

export function SanctionsPage() {
  const [search, setSearch] = useState("");
  const [financialStatus, setFinancialStatus] = useState("");

  const query = useQuery({
    queryKey: ["sanctions", { search, financialStatus }],
    queryFn: () => api<Paginated<Sanction>>(`/sanctions${qs({ search, financialStatus })}`),
  });

  return (
    <>
      <PageHeader
        title="Sanctions"
        subtitle={
          query.data
            ? `${query.data.total} on the register`
            : "Technical and financial sanction, tracked separately"
        }
        actions={
          <button
            onClick={() => void downloadReport("sanctions", { q: search, status: financialStatus || undefined })}
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
              className="field w-72 pl-9"
            />
          </div>
          <select
            value={financialStatus}
            onChange={(e) => setFinancialStatus(e.target.value)}
            className="field w-48"
          >
            <option value="">Any financial status</option>
            {SANCTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SANCTION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sanctions…
            </div>
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">
              {(query.error as Error).message}
            </p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">
              Nothing on the register yet — record a sanction from an application.
            </p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Application</th>
                  <th className="px-4 py-2.5 font-bold">Applicant</th>
                  <th className="px-4 py-2.5 font-bold">Lender</th>
                  <th className="px-4 py-2.5 font-bold">Sanctioned</th>
                  <th className="px-4 py-2.5 font-bold">ROI</th>
                  <th className="px-4 py-2.5 font-bold">Letter</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-line/70 last:border-0 hover:bg-bg-light/70"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/applications/$applicationId"
                        params={{ applicationId: s.application.id }}
                        className="font-semibold text-navy hover:text-gold-dark"
                      >
                        {s.application.applicationNo}
                      </Link>
                      <p className="text-[12px] text-muted">{s.application.loanProduct?.name}</p>
                    </td>
                    <td className="px-4 py-3">{s.application.applicants[0]?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{s.application.lender?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{formatAmount(s.sanctionedAmount)}</td>
                    <td className="px-4 py-3 text-muted">
                      {s.interestRate ? `${s.interestRate}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {s.sanctionLetterNo ?? "—"}
                      {s.validTill && (
                        <p className="text-[12px]">valid to {formatDate(s.validTill)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <SanctionStatusBadge status={s.technicalStatus} label="Tech" />
                        <SanctionStatusBadge status={s.financialStatus} label="Fin" />
                      </div>
                    </td>
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
