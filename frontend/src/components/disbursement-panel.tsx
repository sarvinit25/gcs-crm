import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatAmount, formatDate } from "../lib/format";
import { netOfDeductions } from "../lib/loan-math";
import {
  DISBURSAL_MODE_LABEL,
  ROI_TYPE_LABEL,
  type DisbursalMode,
  type DisbursementSummary,
  type RoiType,
  type Sanction,
} from "../lib/types";
import { CommissionBlock } from "./commission-block";
import { Modal } from "./modal";
import { DatePicker } from "./date-picker";
import { useAuth } from "../lib/auth";

const ROI_TYPES = Object.keys(ROI_TYPE_LABEL) as RoiType[];
const DISBURSAL_MODES = Object.keys(DISBURSAL_MODE_LABEL) as DisbursalMode[];

const numberOrNaN = (value: string) => (value === "" ? NaN : Number(value));

export function DisbursementPanel({ applicationId }: { applicationId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  // The same query the sanction panel uses, so the form can offer the lender's rate and fee.
  const sanction = useQuery({
    queryKey: ["sanction", applicationId],
    queryFn: () => api<Sanction | null>(`/applications/${applicationId}/sanction`),
  });
  const [amountText, setAmountText] = useState("");
  const [deductionText, setDeductionText] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["disbursements", applicationId],
    queryFn: () => api<DisbursementSummary>(`/applications/${applicationId}/disbursements`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["disbursements", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["disbursements"] });
    void queryClient.invalidateQueries({ queryKey: ["sanction", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["sanctions"] });
    void queryClient.invalidateQueries({ queryKey: ["money-trail", applicationId] });
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
      setAmountText("");
      setDeductionText({});
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
          <button onClick={() => setShowForm(true)} className="btn-ghost">
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
            <Modal
              title="Record Disbursement"
              subtitle={`Up to ${formatAmount(s!.undrawn)} still undrawn against this sanction`}
              onClose={() => setShowForm(false)}
              maxWidth="max-w-lg"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const num = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
                  create.mutate({
                    amount: Number(f.get("amount")),
                    disbursedAt: new Date(f.get("disbursedAt") as string).toISOString(),
                    interestRate: num("interestRate"),
                    roiType: (f.get("roiType") as string) || undefined,
                    loanAccountNo: (f.get("loanAccountNo") as string) || undefined,
                    utrNo: (f.get("utrNo") as string) || undefined,
                    processingFee: num("processingFee"),
                    insuranceAmount: num("insuranceAmount"),
                    documentationCharges: num("documentationCharges"),
                    stampDuty: num("stampDuty"),
                    otherDeductions: num("otherDeductions"),
                    mode: (f.get("mode") as string) || undefined,
                    bankName: (f.get("bankName") as string) || undefined,
                    accountNo: (f.get("accountNo") as string) || undefined,
                    ifsc: (f.get("ifsc") as string) || undefined,
                    note: (f.get("note") as string) || undefined,
                  });
                }}
                className="grid gap-2.5 sm:grid-cols-2"
              >
                <input
                  name="amount"
                  type="number"
                  required
                  min={1}
                  max={s!.undrawn || undefined}
                  placeholder={`Amount (up to ${s!.undrawn})`}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  className="field sm:col-span-2"
                />
                <DatePicker name="disbursedAt" required placeholder="Disbursement date" />
                <input name="loanAccountNo" placeholder="Loan account number" className="field" />
                <input
                  name="interestRate"
                  type="number"
                  step="0.01"
                  placeholder="Updated ROI %"
                  defaultValue={sanction.data?.interestRate ? Number(sanction.data.interestRate) : undefined}
                  className="field"
                />
                <select name="roiType" defaultValue="" className="field">
                  <option value="">ROI type</option>
                  {ROI_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ROI_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <input name="utrNo" placeholder="UTR number" className="field" />
                <select name="mode" defaultValue="" className="field">
                  <option value="">Mode of disbursal</option>
                  {DISBURSAL_MODES.map((m) => (
                    <option key={m} value={m}>
                      {DISBURSAL_MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
                <input name="bankName" placeholder="Beneficiary bank" className="field" />
                <input name="accountNo" placeholder="Account number" className="field" />
                <input name="ifsc" placeholder="IFSC code" className="field uppercase sm:col-span-2" />

                <p className="mt-1 text-[11px] font-bold tracking-wide text-muted uppercase sm:col-span-2">
                  Deductions
                </p>
                {(
                  [
                    ["processingFee", "Processing fee"],
                    ["insuranceAmount", "Insurance amount"],
                    ["documentationCharges", "Documentation charges"],
                    ["stampDuty", "Stamp duty"],
                    ["otherDeductions", "Other deductions"],
                  ] as const
                ).map(([name, label]) => (
                  <input
                    key={name}
                    name={name}
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder={label}
                    value={
                      deductionText[name] ??
                      (name === "processingFee" && sanction.data?.processingFee
                        ? String(Number(sanction.data.processingFee))
                        : "")
                    }
                    onChange={(e) => setDeductionText((d) => ({ ...d, [name]: e.target.value }))}
                    // five fields in two columns: the last one takes the full row so nothing is left hanging
                    className={name === "otherDeductions" ? "field sm:col-span-2" : "field"}
                  />
                ))}
                {Number(amountText) > 0 && (
                  <p className="rounded-lg bg-bg-light px-3 py-2 text-[13px] sm:col-span-2">
                    <span className="text-muted">Net disbursed </span>
                    <span className="font-bold text-navy">
                      {formatAmount(
                        netOfDeductions(
                          Number(amountText),
                          [
                            "processingFee",
                            "insuranceAmount",
                            "documentationCharges",
                            "stampDuty",
                            "otherDeductions",
                          ].map((k) =>
                            numberOrNaN(
                              deductionText[k] ??
                                (k === "processingFee" && sanction.data?.processingFee
                                  ? String(Number(sanction.data.processingFee))
                                  : ""),
                            ),
                          ),
                        ),
                      )}
                    </span>
                  </p>
                )}

                <input name="note" placeholder="Note" className="field sm:col-span-2" />
                <div className="mt-2 flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">
                    Cancel
                  </button>
                  <button type="submit" disabled={create.isPending} className="btn-primary">
                    {create.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Record disbursement
                  </button>
                </div>
              </form>
            </Modal>
          )}

          <ul className="mt-4 space-y-2">
            {!s!.items.length && (
              <li className="text-[13px] text-muted">
                {s!.sanctionedAmount
                  ? "Nothing disbursed yet."
                  : "Record an approved financial sanction before disbursing."}
              </li>
            )}
            {s!.items.map((d) => {
              const deductions = [
                d.processingFee,
                d.insuranceAmount,
                d.documentationCharges,
                d.stampDuty,
                d.otherDeductions,
              ]
                .map(Number)
                .filter((v) => v > 0);
              const totalDeductions = deductions.reduce((sum, v) => sum + v, 0);
              return (
                <li key={d.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
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
                        {d.loanAccountNo && ` · A/C ${d.loanAccountNo}`}
                        {d.mode && ` · ${DISBURSAL_MODE_LABEL[d.mode]}`}
                        {d.utrNo && ` · UTR ${d.utrNo}`}
                        {d.interestRate &&
                          ` · ${d.interestRate}%${d.roiType ? ` (${ROI_TYPE_LABEL[d.roiType]})` : ""}`}
                        {" · balance "}
                        {formatAmount(d.runningBalance)}
                      </p>
                      {(d.bankName || d.accountNo || d.ifsc) && (
                        <p className="mt-0.5 text-[12px] text-muted">
                          {[d.bankName, d.accountNo && `A/C ${d.accountNo}`, d.ifsc].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {totalDeductions > 0 && (
                        <p className="mt-0.5 text-[12px] text-muted">
                          Net {formatAmount(d.netAmount)} after deductions of {formatAmount(totalDeductions)}
                          {" ("}
                          {[
                            d.processingFee && `Processing ${formatAmount(d.processingFee)}`,
                            d.insuranceAmount && `Insurance ${formatAmount(d.insuranceAmount)}`,
                            d.documentationCharges &&
                              `Documentation ${formatAmount(d.documentationCharges)}`,
                            d.stampDuty && `Stamp duty ${formatAmount(d.stampDuty)}`,
                            d.otherDeductions && `Other ${formatAmount(d.otherDeductions)}`,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                          {")"}
                        </p>
                      )}
                      {d.note && <p className="mt-0.5 text-[12px] text-muted">{d.note}</p>}
                    </div>
                    {!d.commission && (
                      <button
                        onClick={() => remove.mutate(d.id)}
                        title="Reverse this payout"
                        className="rounded p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {user?.role !== "ADVISOR" && (
                    <CommissionBlock
                      applicationId={applicationId}
                      disbursementId={d.id}
                      amount={d.amount}
                      commission={d.commission}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
