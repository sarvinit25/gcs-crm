import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatAmount } from "../lib/format";
import type { Commission, PayoutStatus } from "../lib/types";
import { Modal } from "./modal";

type Assignable = { id: string; name: string };
type PartnerOption = { id: string; name: string };
type SplitRow = { kind: "user" | "partner"; id: string; sharePercent: string; stakeholderRole: string };

const STATUS_STYLE: Record<PayoutStatus, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  PARTIAL: "bg-sky-50 text-sky-700",
  PAID: "bg-emerald-50 text-emerald-700",
};

const STAKEHOLDER_ROLES = ["Lead Creator", "RO", "Sales Manager", "Manager"];

const nextStatus = (status: PayoutStatus): PayoutStatus =>
  status === "PENDING" ? "PARTIAL" : status === "PARTIAL" ? "PAID" : "PENDING";

/** Recorded per-disbursement — lets a staff member log what the lender pays
 * GCS on a payout, and split it across whoever earned a cut. */
export function CommissionBlock({
  applicationId,
  disbursementId,
  amount,
  commission,
}: {
  applicationId: string;
  disbursementId: string;
  amount: string | number;
  commission: Commission | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [grossRate, setGrossRate] = useState("");
  const [rows, setRows] = useState<SplitRow[]>([
    { kind: "user", id: "", sharePercent: "", stakeholderRole: "" },
  ]);

  const staffQuery = useQuery({
    queryKey: ["team-assignable"],
    queryFn: () => api<Assignable[]>("/team/assignable"),
    enabled: showForm,
  });
  const partnersQuery = useQuery({
    queryKey: ["partners", { includeInactive: false }],
    queryFn: () => api<PartnerOption[]>("/partners?includeInactive=false"),
    enabled: showForm,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["disbursements", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["commissions"] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/disbursements/${disbursementId}/commission`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setShowForm(false);
      invalidate();
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status: PayoutStatus) =>
      api(`/commissions/${commission!.id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
  });

  const updateSplitStatus = useMutation({
    mutationFn: ({ splitId, status }: { splitId: string; status: PayoutStatus }) =>
      api(`/commissions/${commission!.id}/splits/${splitId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: invalidate,
  });

  const totalPercent = rows.reduce((sum, r) => sum + (Number(r.sharePercent) || 0), 0);

  if (commission) {
    return (
      <div className="mt-2 rounded-lg border border-gold/20 bg-gold-pale/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-bold text-navy">
            Commission {formatAmount(commission.grossAmount)}
            <span className="ml-1.5 font-normal text-muted">({commission.grossRate}%)</span>
          </p>
          <button
            onClick={() => updateStatus.mutate(nextStatus(commission.status))}
            title="Click to advance status"
            className={clsx(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              STATUS_STYLE[commission.status],
            )}
          >
            {commission.status}
          </button>
        </div>
        {commission.splits.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {commission.splits.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-muted">
                  {s.stakeholderRole && (
                    <span className="mr-1 rounded bg-navy/5 px-1.5 py-0.5 text-[10px] font-bold text-navy">
                      {s.stakeholderRole}
                    </span>
                  )}
                  {s.user?.name ?? s.sourcingPartner?.name ?? "—"} · {s.sharePercent}% ·{" "}
                  {formatAmount(s.amount)}
                </span>
                <button
                  onClick={() => updateSplitStatus.mutate({ splitId: s.id, status: nextStatus(s.status) })}
                  className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_STYLE[s.status])}
                >
                  {s.status}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setShowForm(true)}
        className="text-[12px] font-semibold text-gold-dark hover:text-navy"
      >
        <Plus className="mr-1 inline h-3 w-3" /> Record commission
      </button>

      {showForm && (
        <Modal
          title="Record Commission"
          subtitle="What the lender pays GCS on this payout, split across stakeholders"
          onClose={() => setShowForm(false)}
          maxWidth="max-w-lg"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                grossRate: Number(grossRate),
                splits: rows
                  .filter((r) => r.id && r.sharePercent)
                  .map((r) => ({
                    [r.kind === "user" ? "userId" : "sourcingPartnerId"]: r.id,
                    sharePercent: Number(r.sharePercent),
                    stakeholderRole: r.stakeholderRole || undefined,
                  })),
              });
            }}
            className="space-y-3"
          >
            {create.isError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {(create.error as Error).message}
              </p>
            )}

            <div className="flex items-center gap-2">
              <input
                value={grossRate}
                onChange={(e) => setGrossRate(e.target.value)}
                type="number"
                step="0.01"
                min={0.01}
                max={100}
                required
                placeholder="Commission rate % from lender"
                className="field flex-1"
              />
              <span className="whitespace-nowrap text-[13px] text-muted">
                ≈ {formatAmount((Number(amount) * (Number(grossRate) || 0)) / 100)}
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Split among stakeholders (optional)
              </p>
              <datalist id="stakeholder-roles">
                {STAKEHOLDER_ROLES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[80px_1fr_1fr_56px_28px] items-center gap-1.5">
                  <select
                    value={row.kind}
                    onChange={(e) => {
                      const kind = e.target.value as SplitRow["kind"];
                      setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, kind, id: "" } : r)));
                    }}
                    className="field text-[12px]"
                  >
                    <option value="user">Staff</option>
                    <option value="partner">Partner</option>
                  </select>
                  <select
                    value={row.id}
                    onChange={(e) =>
                      setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, id: e.target.value } : r)))
                    }
                    className="field text-[12px]"
                  >
                    <option value="">Select…</option>
                    {(row.kind === "user" ? staffQuery.data : partnersQuery.data)?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={row.stakeholderRole}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((r, idx) => (idx === i ? { ...r, stakeholderRole: e.target.value } : r)),
                      )
                    }
                    list="stakeholder-roles"
                    placeholder="Role (e.g. RO)"
                    className="field text-[12px]"
                  />
                  <input
                    value={row.sharePercent}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((r, idx) => (idx === i ? { ...r, sharePercent: e.target.value } : r)),
                      )
                    }
                    type="number"
                    step="0.01"
                    min={0.01}
                    max={100}
                    placeholder="%"
                    className="field text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                    className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setRows((rs) => [...rs, { kind: "user", id: "", sharePercent: "", stakeholderRole: "" }])
                }
                className="text-[12px] font-semibold text-navy hover:text-gold-dark"
              >
                <Plus className="mr-1 inline h-3 w-3" /> Add split
              </button>
              {totalPercent > 100 && (
                <p className="text-[12px] text-red-600">
                  Splits add up to {totalPercent}% — must be 100% or less.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={create.isPending} className="btn-primary">
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Save commission
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
