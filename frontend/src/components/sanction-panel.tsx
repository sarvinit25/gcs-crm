import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { api } from "../lib/api";
import { formatAmount, formatDate } from "../lib/format";
import { SANCTION_STATUSES, SANCTION_STATUS_LABEL, type Sanction } from "../lib/types";
import { SanctionStatusBadge } from "./status-badge";

/**
 * Technical and financial sanction move independently — the technical leg clears
 * the property or asset, the financial leg is what actually sanctions the money.
 */
export function SanctionPanel({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["sanction", applicationId],
    queryFn: () => api<Sanction | null>(`/applications/${applicationId}/sanction`),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/applications/${applicationId}/sanction`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sanction", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["sanctions"] });
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });

  const s = query.data;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">Sanction</h2>
        {s && (
          <div className="flex gap-1.5">
            <SanctionStatusBadge status={s.technicalStatus} label="Tech" />
            <SanctionStatusBadge status={s.financialStatus} label="Fin" />
          </div>
        )}
      </div>

      {query.isPending ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {save.isError && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {(save.error as Error).message}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const num = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
              const date = (k: string) =>
                f.get(k) ? new Date(f.get(k) as string).toISOString() : undefined;

              save.mutate({
                technicalStatus: f.get("technicalStatus"),
                technicalAt: date("technicalAt"),
                technicalNote: (f.get("technicalNote") as string) || undefined,
                financialStatus: f.get("financialStatus"),
                financialAt: date("financialAt"),
                financialNote: (f.get("financialNote") as string) || undefined,
                sanctionedAmount: num("sanctionedAmount"),
                interestRate: num("interestRate"),
                tenureMonths: num("tenureMonths"),
                sanctionLetterNo: (f.get("sanctionLetterNo") as string) || undefined,
                validTill: date("validTill"),
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3">
                <p className="text-[11px] font-bold tracking-wide text-gold-dark uppercase">
                  Technical
                </p>
                <select
                  name="technicalStatus"
                  defaultValue={s?.technicalStatus ?? "PENDING"}
                  className="field mt-2"
                >
                  {SANCTION_STATUSES.map((v) => (
                    <option key={v} value={v}>
                      {SANCTION_STATUS_LABEL[v]}
                    </option>
                  ))}
                </select>
                <input
                  name="technicalAt"
                  type="date"
                  defaultValue={s?.technicalAt?.slice(0, 10) ?? ""}
                  className="field mt-2"
                />
                <input
                  name="technicalNote"
                  defaultValue={s?.technicalNote ?? ""}
                  placeholder="Valuation / legal note"
                  className="field mt-2"
                />
              </div>

              <div className="rounded-lg border border-line p-3">
                <p className="text-[11px] font-bold tracking-wide text-gold-dark uppercase">
                  Financial
                </p>
                <select
                  name="financialStatus"
                  defaultValue={s?.financialStatus ?? "PENDING"}
                  className="field mt-2"
                >
                  {SANCTION_STATUSES.map((v) => (
                    <option key={v} value={v}>
                      {SANCTION_STATUS_LABEL[v]}
                    </option>
                  ))}
                </select>
                <input
                  name="financialAt"
                  type="date"
                  defaultValue={s?.financialAt?.slice(0, 10) ?? ""}
                  className="field mt-2"
                />
                <input
                  name="financialNote"
                  defaultValue={s?.financialNote ?? ""}
                  placeholder="Credit note"
                  className="field mt-2"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Sanctioned amount
                <input
                  name="sanctionedAmount"
                  type="number"
                  min={1}
                  defaultValue={s?.sanctionedAmount ?? ""}
                  className="field mt-1 font-normal tracking-normal normal-case"
                />
              </label>
              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Interest rate %
                <input
                  name="interestRate"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={s?.interestRate ?? ""}
                  className="field mt-1 font-normal tracking-normal normal-case"
                />
              </label>
              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Tenure (months)
                <input
                  name="tenureMonths"
                  type="number"
                  min={1}
                  defaultValue={s?.tenureMonths ?? ""}
                  className="field mt-1 font-normal tracking-normal normal-case"
                />
              </label>
              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Sanction letter no
                <input
                  name="sanctionLetterNo"
                  defaultValue={s?.sanctionLetterNo ?? ""}
                  className="field mt-1 font-normal tracking-normal normal-case"
                />
              </label>
              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Valid till
                <input
                  name="validTill"
                  type="date"
                  defaultValue={s?.validTill?.slice(0, 10) ?? ""}
                  className="field mt-1 font-normal tracking-normal normal-case"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[12px] text-muted">
                {s
                  ? `Sanctioned ${formatAmount(s.sanctionedAmount)} · updated ${formatDate(s.updatedAt)}`
                  : "No sanction recorded yet."}
              </p>
              <button type="submit" disabled={save.isPending} className="btn-primary">
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save sanction
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
