import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Scale } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { OUTCOME_LABEL, type SubmissionList } from "../lib/website";

/** Every enquiry from the CA & Legal form on the website, newest first, each linked to its lead. */
export function CaLegalEnquiries() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["website-submissions", "ca-legal", page],
    queryFn: () => api<SubmissionList>(`/website-submissions${qs({ form: "ca-legal-enquiry", page })}`),
    placeholderData: (prev) => prev,
  });
  const d = query.data;

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (query.isError) return <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{(query.error as Error).message}</p>;

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">
        {d!.total} {d!.total === 1 ? "enquiry" : "enquiries"} from the CA & Legal form on the website. Each one is also a lead, so follow-ups happen on the lead.
      </p>
      <div className="card overflow-x-auto">
        {d!.items.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted">
            <Scale className="mx-auto mb-2 h-6 w-6 text-muted/50" />
            No CA & Legal enquiries yet. They appear here as soon as someone sends the form.
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-2.5 font-bold">Received</th>
                <th className="px-4 py-2.5 font-bold">Who</th>
                <th className="px-4 py-2.5 font-bold">What they asked</th>
                <th className="px-4 py-2.5 font-bold">Result</th>
                <th className="px-4 py-2.5 font-bold">Lead</th>
              </tr>
            </thead>
            <tbody>
              {d!.items.map((s) => {
                const o = OUTCOME_LABEL[s.outcome];
                return (
                  <tr key={s.id} className="border-b border-line/70 align-top last:border-0 hover:bg-bg-light/70">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(s.receivedAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">{s.name}</p>
                      <p className="text-muted">{s.phone}</p>
                      {s.email && <p className="text-muted">{s.email}</p>}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      {s.loanType && <p className="font-semibold text-ink">{s.loanType}</p>}
                      <p className="break-words text-muted">{s.detail || (s.loanType ? "" : "Name and phone only.")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span title={o.hint} className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", o.chip)}>
                        {o.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.lead ? (
                        <Link to="/leads/$leadId" params={{ leadId: s.lead.id }} className="font-semibold text-navy hover:underline">
                          #{s.lead.leadNo} {s.lead.name}
                        </Link>
                      ) : (
                        <span className="text-muted">Lead removed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {d!.total > d!.pageSize && (
        <div className="flex items-center justify-between text-[13px] text-muted">
          <span>
            Page {d!.page} of {Math.ceil(d!.total / d!.pageSize)}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button className="btn-ghost" disabled={page >= Math.ceil(d!.total / d!.pageSize)} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
