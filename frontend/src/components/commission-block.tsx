import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatAmount, formatDate } from "../lib/format";
import {
  COMMISSION_STATUS_LABEL,
  EXTRA_SOURCE_LABEL,
  type Commission,
  type ExtraCommissionSource,
  type PayoutStatus,
  type Sanction,
} from "../lib/types";
import { Modal } from "./modal";
import { DatePicker } from "./date-picker";

type Assignable = { id: string; name: string };
type PartnerOption = { id: string; name: string };
type SplitRow = {
  kind: "user" | "partner";
  id: string;
  mode: "percent" | "amount";
  value: string;
  stakeholderRole: string;
};
type ExtraRow = { source: ExtraCommissionSource; amount: string; note: string };

export const STATUS_STYLE: Record<PayoutStatus, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  CLAIMED: "bg-amber-50 text-amber-700",
  PARTIAL: "bg-sky-50 text-sky-700",
  PAID: "bg-emerald-50 text-emerald-700",
};

const STAKEHOLDER_ROLES = ["Lead Creator", "RO", "Sales Manager", "Manager"];
const EXTRA_SOURCES = Object.keys(EXTRA_SOURCE_LABEL) as ExtraCommissionSource[];

/** Splits and extras use plain pending / part / paid; the lender's commission has its own claim step. */
const nextSplitStatus = (status: PayoutStatus): PayoutStatus =>
  status === "PENDING" ? "PARTIAL" : status === "PARTIAL" ? "PAID" : "PENDING";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Recorded per-disbursement — what the lender pays GCS on a payout (a rate or a
 * flat sum), any extra earnings, how it is split, and where the claim stands:
 * due → claimed → received.
 */
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
  const [dialog, setDialog] = useState<"claim" | "receive" | "extra" | null>(null);
  const [grossMode, setGrossMode] = useState<"rate" | "amount">("rate");
  const [grossValue, setGrossValue] = useState("");
  const [rows, setRows] = useState<SplitRow[]>([
    { kind: "user", id: "", mode: "percent", value: "", stakeholderRole: "" },
  ]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);

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
  // The rate agreed at sanction time, offered as the starting point.
  const sanction = useQuery({
    queryKey: ["sanction", applicationId],
    queryFn: () => api<Sanction | null>(`/applications/${applicationId}/sanction`),
    enabled: showForm,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["disbursements", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["money-trail", applicationId] });
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

  const send = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: Record<string, unknown> }) =>
      api(path, { method, ...(body && { body: JSON.stringify(body) }) }),
    onSuccess: () => {
      setDialog(null);
      invalidate();
    },
  });

  const base = commission ? `/commissions/${commission.id}` : "";
  const gross = Number(commission?.grossAmount ?? 0);
  const received = Number(commission?.receivedAmount ?? (commission?.status === "PAID" ? gross : 0));
  const outstanding = Math.max(gross - received, 0);

  const payout = Number(amount);
  const grossPreview =
    grossMode === "rate" ? (payout * (Number(grossValue) || 0)) / 100 : Number(grossValue) || 0;
  const splitAmount = (r: SplitRow) =>
    r.mode === "percent" ? (grossPreview * (Number(r.value) || 0)) / 100 : Number(r.value) || 0;
  const splitTotal = rows.reduce((sum, r) => sum + splitAmount(r), 0);

  if (commission) {
    const extrasTotal = commission.extras.reduce((sum, e) => sum + Number(e.amount), 0);
    return (
      <div className="mt-2 rounded-lg border border-gold/20 bg-gold-pale/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-bold text-navy">
            Commission {formatAmount(commission.grossAmount)}
            <span className="ml-1.5 font-normal text-muted">({commission.grossRate}%)</span>
          </p>
          <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_STYLE[commission.status])}>
            {COMMISSION_STATUS_LABEL[commission.status]}
          </span>
        </div>

        <p className="mt-1 text-[12px] text-muted">
          {commission.claimedAt && `Claimed ${formatDate(commission.claimedAt)}`}
          {commission.claimNote && ` — ${commission.claimNote}`}
          {received > 0 &&
            `${commission.claimedAt ? " · " : ""}Received ${formatAmount(received)} of ${formatAmount(gross)}${
              commission.receivedAt ? ` (last ${formatDate(commission.receivedAt)})` : ""
            }${commission.receivedRef ? ` · ref ${commission.receivedRef}` : ""}`}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {commission.status === "PENDING" && (
            <button onClick={() => setDialog("claim")} className="btn-ghost !py-1 text-[12px]">
              Claim from lender
            </button>
          )}
          {commission.status !== "PAID" && (
            <button onClick={() => setDialog("receive")} className="btn-ghost !py-1 text-[12px]">
              Record receipt
            </button>
          )}
          <button
            onClick={() =>
              send.mutate({
                path: base,
                method: "PATCH",
                body: {
                  status:
                    commission.status === "PENDING"
                      ? "CLAIMED"
                      : commission.status === "CLAIMED"
                        ? "PARTIAL"
                        : commission.status === "PARTIAL"
                          ? "PAID"
                          : "PENDING",
                },
              })
            }
            title="Move the status by hand — for correcting a mistake"
            className="text-[11px] text-muted underline decoration-dotted hover:text-navy"
          >
            correct status
          </button>
        </div>
        {send.isError && <p className="mt-1 text-[12px] text-red-600">{(send.error as Error).message}</p>}

        <div className="mt-3 border-t border-gold/20 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
              Extra commissions{extrasTotal > 0 && ` · ${formatAmount(extrasTotal)}`}
            </p>
            <button
              onClick={() => setDialog("extra")}
              className="text-[12px] font-semibold text-gold-dark hover:text-navy"
            >
              <Plus className="mr-0.5 inline h-3 w-3" /> Add source
            </button>
          </div>
          {commission.extras.length === 0 ? (
            <p className="mt-1 text-[12px] text-muted">
              None — subvention, insurance and cross-sell earnings go here.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {commission.extras.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-muted">
                    <span className="mr-1 rounded bg-navy/5 px-1.5 py-0.5 text-[10px] font-bold text-navy">
                      {EXTRA_SOURCE_LABEL[e.source]}
                    </span>
                    {formatAmount(e.amount)}
                    {e.note && ` · ${e.note}`}
                    {e.receivedAt && ` · received ${formatDate(e.receivedAt)}`}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        send.mutate({
                          path: `${base}/extras/${e.id}`,
                          method: "PATCH",
                          body: { status: e.status === "PAID" ? "PENDING" : "PAID" },
                        })
                      }
                      title={e.status === "PAID" ? "Mark as not yet received" : "Mark as received"}
                      className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_STYLE[e.status])}
                    >
                      {e.status === "PAID" ? "Received" : "Due"}
                    </button>
                    <button
                      onClick={() => send.mutate({ path: `${base}/extras/${e.id}`, method: "DELETE" })}
                      className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {commission.splits.length > 0 && (
          <div className="mt-3 border-t border-gold/20 pt-2">
            <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Payouts</p>
            <ul className="mt-1.5 space-y-1.5">
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
                    onClick={() =>
                      send.mutate({
                        path: `${base}/splits/${s.id}`,
                        method: "PATCH",
                        body: { status: nextSplitStatus(s.status) },
                      })
                    }
                    className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_STYLE[s.status])}
                  >
                    {s.status}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dialog === "claim" && (
          <LifecycleModal
            title="Claim commission"
            subtitle={`Raise ${formatAmount(gross)} with the lender`}
            submitLabel="Mark as claimed"
            pending={send.isPending}
            error={send.isError ? (send.error as Error).message : undefined}
            onClose={() => setDialog(null)}
            onSubmit={(f) =>
              send.mutate({
                path: `${base}/claim`,
                method: "POST",
                body: {
                  claimedAt: f.get("date") ? new Date(f.get("date") as string).toISOString() : undefined,
                  note: (f.get("note") as string) || undefined,
                },
              })
            }
          >
            <DatePicker name="date" defaultValue={today()} placeholder="Claim date" />
            <input name="note" placeholder="Note (invoice or claim number)" className="field" />
          </LifecycleModal>
        )}

        {dialog === "receive" && (
          <LifecycleModal
            title="Record receipt"
            subtitle={`${formatAmount(outstanding)} still outstanding from the lender`}
            submitLabel="Record receipt"
            pending={send.isPending}
            error={send.isError ? (send.error as Error).message : undefined}
            onClose={() => setDialog(null)}
            onSubmit={(f) =>
              send.mutate({
                path: `${base}/receive`,
                method: "POST",
                body: {
                  amount: f.get("amount") ? Number(f.get("amount")) : undefined,
                  receivedAt: f.get("date") ? new Date(f.get("date") as string).toISOString() : undefined,
                  reference: (f.get("reference") as string) || undefined,
                },
              })
            }
          >
            <input
              name="amount"
              type="number"
              step="0.01"
              min={0.01}
              max={outstanding || undefined}
              defaultValue={outstanding || undefined}
              placeholder="Amount received"
              className="field"
            />
            <DatePicker name="date" defaultValue={today()} placeholder="Date received" />
            <input name="reference" placeholder="UTR / reference" className="field" />
          </LifecycleModal>
        )}

        {dialog === "extra" && (
          <LifecycleModal
            title="Add extra commission"
            subtitle="Earnings on this payout apart from the lender's commission"
            submitLabel="Add"
            pending={send.isPending}
            error={send.isError ? (send.error as Error).message : undefined}
            onClose={() => setDialog(null)}
            onSubmit={(f) =>
              send.mutate({
                path: `${base}/extras`,
                method: "POST",
                body: {
                  source: f.get("source"),
                  amount: Number(f.get("amount")),
                  note: (f.get("note") as string) || undefined,
                },
              })
            }
          >
            <select name="source" defaultValue="SUBVENTION" className="field">
              {EXTRA_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {EXTRA_SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" min={0.01} required placeholder="Amount" className="field" />
            <input name="note" placeholder="Note (optional)" className="field" />
          </LifecycleModal>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => {
          setShowForm(true);
          setGrossValue("");
        }}
        className="text-[12px] font-semibold text-gold-dark hover:text-navy"
      >
        <Plus className="mr-1 inline h-3 w-3" /> Record commission
      </button>

      {showForm && (
        <Modal
          title="Record Commission"
          subtitle="What the lender pays GCS on this payout, plus extras, split across stakeholders"
          onClose={() => setShowForm(false)}
          maxWidth="max-w-xl"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({
                ...(grossMode === "rate"
                  ? { grossRate: Number(grossValue) }
                  : { grossAmount: Number(grossValue) }),
                splits: rows
                  .filter((r) => r.id && r.value)
                  .map((r) => ({
                    [r.kind === "user" ? "userId" : "sourcingPartnerId"]: r.id,
                    [r.mode === "percent" ? "sharePercent" : "amount"]: Number(r.value),
                    stakeholderRole: r.stakeholderRole || undefined,
                  })),
                extras: extras
                  .filter((x) => Number(x.amount) > 0)
                  .map((x) => ({ source: x.source, amount: Number(x.amount), note: x.note || undefined })),
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
              <select
                value={grossMode}
                onChange={(e) => {
                  setGrossMode(e.target.value as "rate" | "amount");
                  setGrossValue("");
                }}
                className="field w-28"
              >
                <option value="rate">Rate %</option>
                <option value="amount">Flat ₹</option>
              </select>
              <input
                value={grossValue}
                onChange={(e) => setGrossValue(e.target.value)}
                type="number"
                step="0.01"
                min={0.01}
                max={grossMode === "rate" ? 100 : payout}
                required
                placeholder={grossMode === "rate" ? "Commission rate from lender" : "Commission amount from lender"}
                className="field flex-1"
              />
              <span className="whitespace-nowrap text-[13px] text-muted">≈ {formatAmount(grossPreview)}</span>
            </div>
            {grossMode === "rate" && !grossValue && sanction.data?.commissionPercent != null && (
              <button
                type="button"
                onClick={() => setGrossValue(String(Number(sanction.data!.commissionPercent)))}
                className="text-[12px] font-semibold text-gold-dark hover:text-navy"
              >
                Use the {sanction.data.commissionPercent}% expected on the sanction
              </button>
            )}

            <div className="space-y-2">
              <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Extra commissions (optional)
              </p>
              {extras.map((x, i) => (
                <div key={i} className="grid grid-cols-[120px_1fr_1fr_28px] items-center gap-1.5">
                  <select
                    value={x.source}
                    onChange={(e) =>
                      setExtras((xs) =>
                        xs.map((r, idx) => (idx === i ? { ...r, source: e.target.value as ExtraCommissionSource } : r)),
                      )
                    }
                    className="field text-[12px]"
                  >
                    {EXTRA_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {EXTRA_SOURCE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={x.amount}
                    onChange={(e) => setExtras((xs) => xs.map((r, idx) => (idx === i ? { ...r, amount: e.target.value } : r)))}
                    type="number"
                    step="0.01"
                    min={0.01}
                    placeholder="Amount ₹"
                    className="field text-[12px]"
                  />
                  <input
                    value={x.note}
                    onChange={(e) => setExtras((xs) => xs.map((r, idx) => (idx === i ? { ...r, note: e.target.value } : r)))}
                    placeholder="Note"
                    className="field text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={() => setExtras((xs) => xs.filter((_, idx) => idx !== i))}
                    className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setExtras((xs) => [...xs, { source: "SUBVENTION", amount: "", note: "" }])}
                className="text-[12px] font-semibold text-navy hover:text-gold-dark"
              >
                <Plus className="mr-1 inline h-3 w-3" /> Add source
              </button>
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
                <div key={i} className="grid grid-cols-[76px_1fr_1fr_88px_28px] items-center gap-1.5">
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
                  <div className="flex">
                    <input
                      value={row.value}
                      onChange={(e) =>
                        setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))
                      }
                      type="number"
                      step="0.01"
                      min={0.01}
                      max={row.mode === "percent" ? 100 : undefined}
                      placeholder={row.mode === "percent" ? "%" : "₹"}
                      className="field min-w-0 rounded-r-none text-[12px]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRows((rs) =>
                          rs.map((r, idx) =>
                            idx === i ? { ...r, mode: r.mode === "percent" ? "amount" : "percent", value: "" } : r,
                          ),
                        )
                      }
                      title="Switch between a percentage share and a flat amount"
                      className="rounded-r-md border border-l-0 border-line px-1.5 text-[11px] font-bold text-navy hover:bg-bg-light"
                    >
                      {row.mode === "percent" ? "%" : "₹"}
                    </button>
                  </div>
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
                  setRows((rs) => [...rs, { kind: "user", id: "", mode: "percent", value: "", stakeholderRole: "" }])
                }
                className="text-[12px] font-semibold text-navy hover:text-gold-dark"
              >
                <Plus className="mr-1 inline h-3 w-3" /> Add split
              </button>
              {splitTotal > grossPreview + 0.01 && (
                <p className="text-[12px] text-red-600">
                  Splits add up to {formatAmount(splitTotal)} — more than the {formatAmount(grossPreview)} commission.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={create.isPending} className="btn-primary">
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Save commission
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/** A small form in a modal — the claim, receipt and extra-source steps share this shell. */
function LifecycleModal({
  title,
  subtitle,
  submitLabel,
  pending,
  error,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (data: FormData) => void;
  children: React.ReactNode;
}) {
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} maxWidth="max-w-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
        className="space-y-2.5"
      >
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        {children}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
