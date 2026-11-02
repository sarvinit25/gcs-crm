import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Save } from "lucide-react";
import { api } from "../lib/api";
import { formatAmount, formatDate } from "../lib/format";
import { emi, percentAmount } from "../lib/loan-math";
import { useAuth } from "../lib/auth";
import {
  DISBURSAL_STATUS_LABEL,
  SANCTION_STATUSES,
  SANCTION_STATUS_LABEL,
  type DisbursalStatus,
  type Sanction,
} from "../lib/types";
import { SanctionStatusBadge } from "./status-badge";
import { Modal } from "./modal";
import { DatePicker } from "./date-picker";

function LegView({
  label,
  status,
  at,
  note,
}: {
  label: string;
  status: Sanction["technicalStatus"];
  at: string | null;
  note: string | null;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold tracking-wide text-gold-dark uppercase">{label}</p>
        <SanctionStatusBadge status={status} />
      </div>
      <p className="mt-1.5 text-[12px] text-muted">{at ? formatDate(at) : "Not dated"}</p>
      {note && <p className="mt-1 text-[12px] text-ink">{note}</p>}
    </div>
  );
}

function SectionFields({
  legend,
  prefix,
  defaults,
  placeholder,
}: {
  legend: string;
  prefix: string;
  defaults?: Sanction | null;
  placeholder: string;
}) {
  const status = defaults?.[`${prefix}Status` as keyof Sanction] as string | undefined;
  const at = defaults?.[`${prefix}At` as keyof Sanction] as string | null | undefined;
  const note = defaults?.[`${prefix}Note` as keyof Sanction] as string | null | undefined;

  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-[11px] font-bold tracking-wide text-gold-dark uppercase">{legend}</p>
      <select name={`${prefix}Status`} defaultValue={status ?? "PENDING"} className="field mt-2">
        {SANCTION_STATUSES.map((v) => (
          <option key={v} value={v}>
            {SANCTION_STATUS_LABEL[v]}
          </option>
        ))}
      </select>
      <DatePicker name={`${prefix}At`} defaultValue={at?.slice(0, 10) ?? ""} className="mt-2" placeholder="Date" />
      <input
        name={`${prefix}Note`}
        defaultValue={note ?? ""}
        placeholder={placeholder}
        className="field mt-2"
      />
    </div>
  );
}

const DISBURSAL_TONE: Record<DisbursalStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PARTIAL: "bg-sky-50 text-sky-700",
  DISBURSED: "bg-emerald-50 text-emerald-700",
};

export function DisbursalBadge({ status }: { status: DisbursalStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${DISBURSAL_TONE[status]}`}>
      {DISBURSAL_STATUS_LABEL[status]}
    </span>
  );
}

const LABEL = "text-[11px] font-bold tracking-wide text-muted uppercase";
const INPUT = "field mt-1 font-normal tracking-normal normal-case";

/**
 * Amount, rate, tenure and EMI. The EMI is worked out as the other three are
 * typed and only sent to the server if someone overwrites it with the
 * lender's own figure — otherwise the server computes the same number.
 */
function TermsFields({ s, showCommission }: { s?: Sanction | null; showCommission: boolean }) {
  const [amount, setAmount] = useState(s?.sanctionedAmount ? String(Number(s.sanctionedAmount)) : "");
  const [rate, setRate] = useState(s?.interestRate ? String(Number(s.interestRate)) : "");
  const [tenure, setTenure] = useState(s?.tenureMonths ? String(s.tenureMonths) : "");
  const [emiText, setEmiText] = useState(s?.emiAmount ? String(Number(s.emiAmount)) : "");
  const [emiEdited, setEmiEdited] = useState(false);
  const [feePercent, setFeePercent] = useState(
    s?.processingFeePercent ? String(Number(s.processingFeePercent)) : "",
  );
  const [feeText, setFeeText] = useState(s?.processingFee ? String(Number(s.processingFee)) : "");
  const [feeEdited, setFeeEdited] = useState(false);

  const suggestedEmi = emi(
    amount ? Number(amount) : null,
    rate !== "" ? Number(rate) : null,
    tenure ? Number(tenure) : null,
  );
  const shownEmi = emiEdited || suggestedEmi === null ? emiText : String(suggestedEmi);
  const suggestedFee = feePercent !== "" && amount ? percentAmount(Number(amount), Number(feePercent)) : null;
  const shownFee = feeEdited || suggestedFee === null ? feeText : String(suggestedFee);

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <label className={LABEL}>
        Sanctioned amount
        <input name="sanctionedAmount" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={INPUT} />
      </label>
      <label className={LABEL}>
        Interest rate %
        <input name="interestRate" type="number" step="0.01" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className={INPUT} />
      </label>
      <label className={LABEL}>
        Tenure (months)
        <input name="tenureMonths" type="number" min={1} value={tenure} onChange={(e) => setTenure(e.target.value)} className={INPUT} />
      </label>
      <label className={LABEL}>
        EMI {!emiEdited && suggestedEmi !== null && <span className="font-normal text-gold-dark normal-case">(calculated)</span>}
        <input
          name="emiAmount"
          type="number"
          step="0.01"
          min={0}
          value={shownEmi}
          onChange={(e) => {
            setEmiEdited(true);
            setEmiText(e.target.value);
          }}
          className={INPUT}
        />
        <input type="hidden" name="emiManual" value={emiEdited ? "1" : ""} />
      </label>
      <label className={LABEL}>
        First EMI date
        <DatePicker name="firstEmiDate" defaultValue={s?.firstEmiDate?.slice(0, 10) ?? ""} className="mt-1 font-normal tracking-normal normal-case" placeholder="First EMI date" />
      </label>
      <label className={LABEL}>
        Sanction date
        <DatePicker name="sanctionDate" defaultValue={s?.sanctionDate?.slice(0, 10) ?? ""} className="mt-1 font-normal tracking-normal normal-case" placeholder="Sanction date" />
      </label>
      <label className={LABEL}>
        Processing fee %
        <input
          name="processingFeePercent"
          type="number"
          step="0.01"
          min={0}
          max={100}
          value={feePercent}
          onChange={(e) => {
            setFeePercent(e.target.value);
            setFeeEdited(false);
          }}
          className={INPUT}
        />
      </label>
      <label className={LABEL}>
        Processing fee ₹
        <input
          name="processingFee"
          type="number"
          step="0.01"
          min={0}
          value={shownFee}
          onChange={(e) => {
            setFeeEdited(true);
            setFeeText(e.target.value);
          }}
          className={INPUT}
        />
        <input type="hidden" name="feeManual" value={feeEdited ? "1" : ""} />
      </label>
      {showCommission && (
        <label className={LABEL}>
          Expected commission %
          <input name="commissionPercent" type="number" step="0.01" min={0} max={100} defaultValue={s?.commissionPercent ?? ""} className={INPUT} />
        </label>
      )}
      <label className={LABEL}>
        Sanction letter no
        <input name="sanctionLetterNo" defaultValue={s?.sanctionLetterNo ?? ""} className={INPUT} />
      </label>
      <label className={LABEL}>
        Valid till
        <DatePicker name="validTill" defaultValue={s?.validTill?.slice(0, 10) ?? ""} className="mt-1 font-normal tracking-normal normal-case" placeholder="Valid till" />
      </label>
      <label className={LABEL}>
        Bank RM
        <input name="bankRm" defaultValue={s?.bankRm ?? ""} placeholder="Lender's relationship manager" className={INPUT} />
      </label>
      <label className={`${LABEL} sm:col-span-2 lg:col-span-3`}>
        Notes
        <textarea name="notes" defaultValue={s?.notes ?? ""} rows={2} placeholder="Sanction conditions, remarks…" className={INPUT} />
      </label>
    </div>
  );
}

/**
 * Technical, financial and legal sanction legs move independently — technical
 * clears the property/asset, legal clears the title/document review, and
 * financial is what actually sanctions the money.
 */
export function SanctionPanel({ applicationId }: { applicationId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

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
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["sanction", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["sanctions"] });
      void queryClient.invalidateQueries({ queryKey: ["money-trail", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["disbursements", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });

  const s = query.data;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">
          Sanction {s && <span className="ml-1 font-normal text-muted">{s.sanctionNo}</span>}
        </h2>
        <div className="flex items-center gap-1.5">
          {s && (
            <>
              <DisbursalBadge status={s.disbursalStatus} />
              <SanctionStatusBadge status={s.technicalStatus} label="Tech" />
              <SanctionStatusBadge status={s.financialStatus} label="Fin" />
              <SanctionStatusBadge status={s.legalStatus} label="Legal" />
            </>
          )}
          <button onClick={() => setEditing(true)} className="btn-ghost ml-1">
            <Pencil className="h-4 w-4" /> {s ? "Edit" : "Record"}
          </button>
        </div>
      </div>

      {query.isPending ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !s ? (
        <p className="text-[13px] text-muted">No sanction recorded yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <LegView label="Technical" status={s.technicalStatus} at={s.technicalAt} note={s.technicalNote} />
            <LegView label="Financial" status={s.financialStatus} at={s.financialAt} note={s.financialNote} />
            <LegView label="Legal" status={s.legalStatus} at={s.legalAt} note={s.legalNote} />
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg-light p-3 sm:grid-cols-4">
            {[
              ["Sanctioned", formatAmount(s.sanctionedAmount)],
              ["Disbursed", s.drawn > 0 ? `${formatAmount(s.drawn)} (${formatAmount(s.undrawn)} left)` : "Nothing yet"],
              ["Rate", s.interestRate ? `${s.interestRate}%` : "—"],
              ["Tenure", s.tenureMonths ? `${s.tenureMonths} mo` : "—"],
              ["EMI", s.emiAmount ? formatAmount(s.emiAmount) : "—"],
              ["First EMI", formatDate(s.firstEmiDate)],
              ["Sanction date", formatDate(s.sanctionDate)],
              ["Valid till", formatDate(s.validTill)],
              ["Processing fee", s.processingFee ? `${formatAmount(s.processingFee)}${s.processingFeePercent ? ` (${s.processingFeePercent}%)` : ""}` : "—"],
              ["Bank RM", s.bankRm ?? "—"],
              ["Letter no", s.sanctionLetterNo ?? "—"],
              ...(s.commissionPercent != null ? [["Expected commission", `${s.commissionPercent}%`]] : []),
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
                <p className="mt-0.5 text-[13px] font-semibold text-navy">{value}</p>
              </div>
            ))}
          </div>
          {s.notes && <p className="rounded-lg border border-line p-3 text-[12px] text-ink">{s.notes}</p>}
          <p className="text-[12px] text-muted">Updated {formatDate(s.updatedAt)}</p>
        </div>
      )}

      {editing && (
        <Modal
          title={s ? "Edit Sanction" : "Record Sanction"}
          subtitle="Technical, financial and legal evaluation move independently"
          onClose={() => setEditing(false)}
          maxWidth="max-w-2xl"
        >
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
                legalStatus: f.get("legalStatus"),
                legalAt: date("legalAt"),
                legalNote: (f.get("legalNote") as string) || undefined,
                sanctionedAmount: num("sanctionedAmount"),
                interestRate: num("interestRate"),
                tenureMonths: num("tenureMonths"),
                sanctionLetterNo: (f.get("sanctionLetterNo") as string) || undefined,
                validTill: date("validTill"),
                sanctionDate: date("sanctionDate"),
                firstEmiDate: date("firstEmiDate"),
                bankRm: (f.get("bankRm") as string) || undefined,
                // Only the lender's own figures are sent; the server works out the rest.
                emiAmount: f.get("emiManual") ? num("emiAmount") : undefined,
                processingFeePercent: num("processingFeePercent"),
                processingFee: f.get("feeManual") ? num("processingFee") : undefined,
                commissionPercent: num("commissionPercent"),
                notes: (f.get("notes") as string) || undefined,
              });
            }}
          >
            {save.isError && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {(save.error as Error).message}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <SectionFields legend="Technical" prefix="technical" defaults={s} placeholder="Valuation note" />
              <SectionFields legend="Financial" prefix="financial" defaults={s} placeholder="Credit note" />
              <SectionFields legend="Legal" prefix="legal" defaults={s} placeholder="Title / document remarks" />
            </div>

            <TermsFields s={s} showCommission={user?.role !== "ADVISOR"} />

            <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
                Cancel
              </button>
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
        </Modal>
      )}
    </section>
  );
}
