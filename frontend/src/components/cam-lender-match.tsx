import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { api } from "../lib/api";

// The lenders whose recorded rules this customer's CAM meets, worked out from the last SAVED answers (the same match
// that fills the Excel's "Lender match" sheet). Nothing is saved or sent from here; a person confirms each lender.

type Reason = { code: string; ok: boolean; text: string };
type Row = { lenderId: string; lender: string; status: "STRONG" | "POSSIBLE" | "EXPERT_REVIEW" | "EXCLUDED"; score: number | null; reasons: Reason[]; checks: string[]; policyNeedsReview: boolean; programs: number };
type Match = { note: string | null; requested: number | null; productName: string | null; results: Row[] };

const STATUS: Record<Row["status"], { label: string; cls: string }> = {
  STRONG: { label: "Strong match", cls: "bg-emerald-50 text-emerald-700" },
  POSSIBLE: { label: "Possible match", cls: "bg-sky-50 text-sky-700" },
  EXPERT_REVIEW: { label: "Expert review", cls: "bg-amber-50 text-amber-700" },
  EXCLUDED: { label: "Not a fit", cls: "bg-gray-100 text-gray-600" },
};

export function CamLenderMatch({ leadId, savedAt, unsaved }: { leadId: string; savedAt: string; unsaved: boolean }) {
  // keyed on the save time so the list refreshes whenever the CAM is saved
  const q = useQuery({ queryKey: ["cam-match", leadId, savedAt], queryFn: () => api<Match>(`/leads/${leadId}/cam/match`), refetchOnWindowFocus: false });
  const rows = q.data?.results ?? [];
  const fits = rows.filter((r) => r.status !== "EXCLUDED");

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-navy">Lenders that may fit</h2>
          <p className="text-[12px] text-muted">
            This CAM's income, credit score, age, property and loan amount, checked against each lender's recorded rules{q.data?.productName ? ` for ${q.data.productName}` : ""}. Best fit first. A person must confirm each one before it is shown to the customer.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </button>
      </div>

      {unsaved && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">You have unsaved changes. Save the CAM to include them in this match.</p>}
      {q.isLoading && <p className="text-[13px] text-muted">Checking the lender rules…</p>}
      {q.isError && <p className="text-[13px] font-medium text-red-700">{(q.error as Error).message}</p>}
      {q.data?.note && <p className="text-[13px] text-muted">{q.data.note}</p>}

      {rows.length > 0 && (
        <>
          <p className="text-[12px] font-semibold text-navy">{fits.length} of {rows.length} lenders may fit</p>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.lenderId + r.status} className="rounded-xl border border-border">
                <details className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5">
                    <span className="text-[13px] font-semibold text-navy">{r.lender}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                    {r.score !== null && <span className="text-[12px] text-muted">Score {Math.round(r.score)}</span>}
                    {r.policyNeedsReview && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Rules need review</span>}
                    {r.programs > 0 && <span className="text-[11px] text-muted">{r.programs} program{r.programs === 1 ? "" : "s"}</span>}
                    <span className="ml-auto text-[11px] text-muted group-open:hidden">Why</span>
                  </summary>
                  <div className="space-y-2 border-t border-border px-3 py-2.5 text-[12.5px]">
                    <ul className="space-y-1">
                      {r.reasons.map((x, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          {x.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
                          <span>{x.text}</span>
                        </li>
                      ))}
                    </ul>
                    {r.checks.length > 0 && (
                      <div>
                        <p className="font-semibold text-navy">To check before using this lender</p>
                        <ul className="list-disc pl-5 text-muted">{r.checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
