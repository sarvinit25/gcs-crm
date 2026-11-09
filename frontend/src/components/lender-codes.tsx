import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { Modal } from "./modal";

export type LenderCodeRow = {
  id: string;
  product: string;
  loanProduct: { id: string; name: string } | null;
  code: string | null;
  registeredName: string | null;
  payoutText: string | null;
  payoutPercent: string | null;
  contactText: string | null;
  contactPhone: string | null;
  specialCondition: string | null;
  active: boolean;
};

function CodeEditor({ lenderId, row, showPayout, onClose }: { lenderId: string; row?: LenderCodeRow; showPayout: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      row
        ? api(`/lender-codes/${row.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/lender-codes", { method: "POST", body: JSON.stringify({ lenderId, ...body }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lender", lenderId] });
      void queryClient.invalidateQueries({ queryKey: ["lenders-directory"] });
      onClose();
    },
  });
  return (
    <Modal title={row ? "Edit code" : "Add a code"} subtitle="The code we are registered under at this lender" onClose={onClose} maxWidth="max-w-lg">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const t = (k: string) => ((f.get(k) as string) ?? "").trim();
          const pct = t("payoutPercent");
          const opt = (k: string) => t(k) || (row ? null : undefined);
          save.mutate({
            product: t("product"),
            code: opt("code"),
            registeredName: opt("registeredName"),
            ...(showPayout ? { payoutText: opt("payoutText"), payoutPercent: pct ? Number(pct) : row ? null : undefined } : {}),
            contactText: opt("contactText"),
            contactPhone: opt("contactPhone"),
            specialCondition: opt("specialCondition"),
          });
        }}
      >
        <label className="text-[13px] font-semibold text-navy">
          Loan type
          <input name="product" required minLength={2} defaultValue={row?.product} placeholder="e.g. Used Car Loan" className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Code
          <input name="code" defaultValue={row?.code ?? ""} className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy sm:col-span-2">
          Registered under
          <input name="registeredName" defaultValue={row?.registeredName ?? ""} placeholder="Company the code is issued to" className="field mt-1.5 font-normal" />
        </label>
        {showPayout && (
          <>
            <label className="text-[13px] font-semibold text-navy">
              Payout (as the lender states it)
              <input name="payoutText" defaultValue={row?.payoutText ?? ""} placeholder="e.g. 100% of PF" className="field mt-1.5 font-normal" />
            </label>
            <label className="text-[13px] font-semibold text-navy">
              Payout % (if a single figure)
              <input name="payoutPercent" type="number" step="0.001" min={0} max={100} defaultValue={row?.payoutPercent ? Number(row.payoutPercent) : ""} className="field mt-1.5 font-normal" />
            </label>
          </>
        )}
        <label className="text-[13px] font-semibold text-navy">
          Our contact there
          <input name="contactText" defaultValue={row?.contactText ?? ""} className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Contact number
          <input name="contactPhone" inputMode="tel" defaultValue={row?.contactPhone ?? ""} placeholder="10-digit number" className="field mt-1.5 font-normal" />
        </label>
        <label className="text-[13px] font-semibold text-navy sm:col-span-2">
          Special condition
          <textarea name="specialCondition" defaultValue={row?.specialCondition ?? ""} maxLength={400} className="field mt-1.5 min-h-14 font-normal" />
        </label>
        {save.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 sm:col-span-2">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {row ? "Save changes" : "Add code"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The codes GCS is registered under at a lender, one per loan type, with the payout on each (admins and managers only). */
export function LenderCodes({ lenderId, codes, canEdit, showPayout }: { lenderId: string; codes: LenderCodeRow[]; canEdit: boolean; showPayout: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<LenderCodeRow | "new" | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/lender-codes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lender", lenderId] });
      void queryClient.invalidateQueries({ queryKey: ["lenders-directory"] });
    },
  });
  if (!codes.length && !canEdit) return null;
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-navy">
          <KeyRound className="h-4 w-4 text-muted" /> Codes{showPayout ? " & payouts" : ""}
        </h2>
        {canEdit && (
          <button className="btn-ghost" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add code
          </button>
        )}
      </div>
      {!codes.length ? (
        <p className="py-6 text-center text-[13px] text-muted">No codes recorded for this lender yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="py-2 pr-4 font-bold">Loan type</th>
                <th className="py-2 pr-4 font-bold">Code &amp; registered under</th>
                {showPayout && <th className="py-2 pr-4 font-bold">Payout</th>}
                <th className="py-2 pr-4 font-bold">Our contact</th>
                {canEdit && <th className="py-2 font-bold" />}
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className={clsx("border-b border-line/70 align-top last:border-0", !c.active && "opacity-50")}>
                  <td className="whitespace-normal py-2.5 pr-4 font-semibold text-navy">{c.product}</td>
                  <td className="whitespace-normal py-2.5 pr-4">
                    <p className="font-mono text-[12px] text-ink">{c.code ?? "—"}</p>
                    {c.registeredName && <p className="mt-0.5 text-[11.5px] text-muted">{c.registeredName}</p>}
                  </td>
                  {showPayout && (
                    <td className="whitespace-normal py-2.5 pr-4">
                      <p className="text-ink">{c.payoutText ?? "—"}</p>
                      {c.specialCondition && <p className="mt-0.5 text-[12px] text-amber-700">{c.specialCondition}</p>}
                    </td>
                  )}
                  <td className="whitespace-normal py-2.5 pr-4">
                    <p className="text-ink">{c.contactText ?? "—"}</p>
                    {c.contactPhone && <p className="font-mono text-[12px] text-muted">{c.contactPhone}</p>}
                  </td>
                  {canEdit && (
                    <td className="py-2.5 whitespace-nowrap">
                      <button onClick={() => setEditing(c)} className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-navy" title="Edit" aria-label={`Edit ${c.product} code`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => window.confirm(`Remove the ${c.product} code?`) && remove.mutate(c.id)}
                        className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-red-600"
                        title="Remove"
                        aria-label={`Remove ${c.product} code`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!showPayout && <p className="mt-3 text-[12px] text-muted">Payouts are visible to admins and managers.</p>}
      {editing && <CodeEditor lenderId={lenderId} row={editing === "new" ? undefined : editing} showPayout={showPayout} onClose={() => setEditing(null)} />}
    </section>
  );
}
