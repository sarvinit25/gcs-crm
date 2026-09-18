import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatAmount, formatDate } from "../lib/format";
import type { DisbursementSummary } from "../lib/types";

export function DisbursementPanel({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const query = useQuery({
    queryKey: ["disbursements", applicationId],
    queryFn: () => api<DisbursementSummary>(`/applications/${applicationId}/disbursements`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["disbursements", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["disbursements"] });
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/applications/${applicationId}/disbursements`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setShowForm(false);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/applications/${applicationId}/disbursements/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const error = [create, remove].find((m) => m.isError)?.error;
  const s = query.data;
  const fullyDrawn = s ? s.undrawn === 0 && s.drawn > 0 : false;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">
          Disbursements <span className="text-muted">({s?.items.length ?? 0})</span>
        </h2>
        {!fullyDrawn && (
          <button onClick={() => setShowForm(!showForm)} className="btn-ghost">
            <Plus className="h-4 w-4" /> Record payout
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {(error as Error).message}
        </p>
      )}

      {query.isPending ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-bg-light p-3">
            {[
              ["Sanctioned", s!.sanctionedAmount],
              ["Drawn", s!.drawn],
              ["Undrawn", s!.undrawn],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
                <p
                  className={clsx(
                    "mt-0.5 text-[15px] font-bold",
                    label === "Undrawn" && Number(value) > 0 ? "text-gold-dark" : "text-navy",
                  )}
                >
                  {formatAmount(value as number)}
                </p>
              </div>
            ))}
          </div>

          {showForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                create.mutate({
                  amount: Number(f.get("amount")),
                  disbursedAt: new Date(f.get("disbursedAt") as string).toISOString(),
                  interestRate: f.get("interestRate") ? Number(f.get("interestRate")) : undefined,
                  utrNo: (f.get("utrNo") as string) || undefined,
                  note: (f.get("note") as string) || undefined,
                });
              }}
              className="mt-4 grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2"
            >
              <input
                name="amount"
                type="number"
                required
                min={1}
                max={s!.undrawn || undefined}
                placeholder={`Amount (up to ${s!.undrawn})`}
                className="field"
              />
              <input name="disbursedAt" type="date" required className="field" />
              <input
                name="interestRate"
                type="number"
                step="0.01"
                placeholder="Interest rate %"
                className="field"
              />
              <input name="utrNo" placeholder="UTR number" className="field" />
              <input name="note" placeholder="Note" className="field sm:col-span-2" />
              <button
                type="submit"
                disabled={create.isPending}
                className="btn-primary sm:col-span-2"
              >
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Record disbursement
              </button>
            </form>
          )}

          <ul className="mt-4 space-y-2">
            {!s!.items.length && (
              <li className="text-[13px] text-muted">
                {s!.sanctionedAmount
                  ? "Nothing disbursed yet."
                  : "Record an approved financial sanction before disbursing."}
              </li>
            )}
            {s!.items.map((d) => (
              <li
                key={d.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-line p-3"
              >
                <div>
                  <p className="text-[13px] font-semibold text-navy">
                    {formatAmount(d.amount)}
                    <span
                      className={clsx(
                        "ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold",
                        d.type === "FULL"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-sky-50 text-sky-700",
                      )}
                    >
                      {d.type}
                    </span>
                  </p>
                  <p className="text-[12px] text-muted">
                    {formatDate(d.disbursedAt)}
                    {d.utrNo && ` · UTR ${d.utrNo}`}
                    {d.interestRate && ` · ${d.interestRate}%`}
                    {" · balance "}
                    {formatAmount(d.runningBalance)}
                  </p>
                  {d.note && <p className="mt-0.5 text-[12px] text-muted">{d.note}</p>}
                </div>
                <button
                  onClick={() => remove.mutate(d.id)}
                  title="Reverse this payout"
                  className="rounded p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
