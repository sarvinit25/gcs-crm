import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { Modal } from "./modal";
import type { LenderRow } from "../lib/lenders";

type LoanType = { id: string; name: string };

const num = (f: FormData, key: string) => {
  const t = String(f.get(key) ?? "").trim();
  return t ? Number(t) : undefined;
};

const Label = ({ children, hint, className }: { children: React.ReactNode; hint?: string; className?: string }) => (
  <span className={clsx("grid gap-1 text-[12px] font-semibold text-navy", className)}>
    {children}
    {hint && <span className="text-[11px] font-normal text-muted">{hint}</span>}
  </span>
);

/** One loan type's terms, added to many lenders in one go. Lenders that already have the loan type are skipped. */
export function BulkPolicyModal({ lenders, onClose }: { lenders: LenderRow[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ loanType: string; created: string[]; skipped: string[] } | null>(null);
  const active = lenders.filter((l) => l.active);

  const types = useQuery({ queryKey: ["loan-products"], queryFn: () => api<LoanType[]>("/loan-products") });

  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ loanType: string; created: string[]; skipped: string[] }>("/lender-policies/bulk", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (r) => {
      setResult(r);
      void queryClient.invalidateQueries({ queryKey: ["lenders-directory"] });
      void queryClient.invalidateQueries({ queryKey: ["lender"] });
      void queryClient.invalidateQueries({ queryKey: ["lender-policies"] });
    },
  });

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const choose = (type?: "BANK" | "NBFC") => setPicked(active.filter((l) => !type || l.type === type).map((l) => l.id));
  const link = "text-[12px] font-semibold text-navy underline-offset-2 hover:underline";

  if (result) {
    return (
      <Modal title="Added" onClose={onClose}>
        <div className="space-y-3 text-[13px]">
          <p className="text-navy">
            <strong>{result.loanType}</strong> is now on {result.created.length} lender{result.created.length === 1 ? "" : "s"}
            {result.created.length ? `: ${result.created.join(", ")}` : ""}.
          </p>
          {result.skipped.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
              Skipped, because they already have it: {result.skipped.join(", ")}. Their existing terms were not changed.
            </p>
          )}
          <p className="text-muted">
            The new terms start as &ldquo;not yet verified&rdquo;. Open each one under Lender policies and confirm it once you have checked it with the lender.
          </p>
          <div className="flex justify-end">
            <button onClick={onClose} className="btn-primary">
              Done
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a loan type to many lenders" subtitle="Enter the terms once; each selected lender gets its own copy to adjust later" onClose={onClose} maxWidth="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          add.mutate({
            lenderIds: picked,
            loanProductId: String(f.get("loanProductId")),
            minAmount: num(f, "minAmount"),
            maxAmount: num(f, "maxAmount"),
            minTenureMonths: num(f, "minTenureMonths"),
            maxTenureMonths: num(f, "maxTenureMonths"),
            rateType: String(f.get("rateType")) || undefined,
            minRate: num(f, "minRate"),
            maxRate: num(f, "maxRate"),
            processingFee: String(f.get("processingFee") ?? "").trim() || undefined,
            commissionPercent: num(f, "commissionPercent"),
            minCreditScore: num(f, "minCreditScore"),
            maxFoirPercent: num(f, "maxFoirPercent"),
            minBusinessVintageMonths: num(f, "minBusinessVintageMonths"),
            notes: String(f.get("notes") ?? "").trim() || undefined,
          });
        }}
        className="grid gap-3 sm:grid-cols-4"
      >
        {add.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:col-span-4">{(add.error as Error).message}</p>
        )}

        <div className="sm:col-span-4">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-navy">Lenders</p>
            <span className="flex gap-3">
              <button type="button" className={link} onClick={() => choose()}>All</button>
              <button type="button" className={link} onClick={() => choose("BANK")}>Banks</button>
              <button type="button" className={link} onClick={() => choose("NBFC")}>NBFCs</button>
              <button type="button" className={link} onClick={() => setPicked([])}>Clear</button>
            </span>
          </div>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {active.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={picked.includes(l.id)}
                onClick={() => toggle(l.id)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-[12px] font-semibold transition",
                  picked.includes(l.id) ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:text-navy",
                )}
              >
                {l.shortName || l.name}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {picked.length} of {active.length} lenders selected — lenders that already have this loan type are skipped.
          </p>
        </div>

        <label className="sm:col-span-4">
          <Label>Loan type</Label>
          <select name="loanProductId" required defaultValue="" className="field mt-1 font-normal">
            <option value="" disabled>
              Select loan type
            </option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="sm:col-span-2">
          <Label>Smallest amount (₹)</Label>
          <input name="minAmount" type="number" min={0} placeholder="e.g. 100000" className="field mt-1 font-normal" />
        </label>
        <label className="sm:col-span-2">
          <Label>Largest amount (₹)</Label>
          <input name="maxAmount" type="number" min={0} placeholder="e.g. 5000000" className="field mt-1 font-normal" />
        </label>
        <label className="sm:col-span-2">
          <Label>Shortest tenure (months)</Label>
          <input name="minTenureMonths" type="number" min={1} max={600} placeholder="e.g. 12" className="field mt-1 font-normal" />
        </label>
        <label className="sm:col-span-2">
          <Label>Longest tenure (months)</Label>
          <input name="maxTenureMonths" type="number" min={1} max={600} placeholder="e.g. 240" className="field mt-1 font-normal" />
        </label>

        <label>
          <Label>Rate type</Label>
          <select name="rateType" defaultValue="" className="field mt-1 font-normal">
            <option value="">Not set</option>
            <option value="FLOATING">Floating</option>
            <option value="FIXED">Fixed</option>
          </select>
        </label>
        <label>
          <Label>Lowest rate (%)</Label>
          <input name="minRate" type="number" min={0} max={100} step="0.01" placeholder="e.g. 8.5" className="field mt-1 font-normal" />
        </label>
        <label>
          <Label>Highest rate (%)</Label>
          <input name="maxRate" type="number" min={0} max={100} step="0.01" placeholder="e.g. 12.5" className="field mt-1 font-normal" />
        </label>
        <label>
          <Label>Processing fee</Label>
          <input name="processingFee" maxLength={200} placeholder="e.g. 1% + GST" className="field mt-1 font-normal" />
        </label>

        <label>
          <Label>Our commission (%)</Label>
          <input name="commissionPercent" type="number" min={0} max={100} step="0.01" placeholder="e.g. 1.5" className="field mt-1 font-normal" />
        </label>
        <label>
          <Label>Lowest CIBIL score</Label>
          <input name="minCreditScore" type="number" min={300} max={900} placeholder="e.g. 700" className="field mt-1 font-normal" />
        </label>
        <label>
          <Label>Highest FOIR (%)</Label>
          <input name="maxFoirPercent" type="number" min={1} max={100} placeholder="e.g. 55" className="field mt-1 font-normal" />
        </label>
        <label>
          <Label>Business age (months)</Label>
          <input name="minBusinessVintageMonths" type="number" min={0} placeholder="e.g. 24" className="field mt-1 font-normal" />
        </label>

        <label className="sm:col-span-4">
          <Label>Notes</Label>
          <textarea name="notes" rows={2} maxLength={1000} placeholder="Any additional notes…" className="field mt-1 font-normal" />
        </label>

        <div className="flex justify-end gap-2 sm:col-span-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={add.isPending || picked.length === 0} className="btn-primary">
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add to {picked.length} lender{picked.length === 1 ? "" : "s"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
