import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ClipboardList, Loader2, Save } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";

type Field = { key: string; label: string; type: "text" | "longtext" | "money" | "percent" | "number" | "select" | "yesno" | "multi" | "date" | "phone" | "email"; options?: string[]; hint?: string };
type Section = { id: string; title: string; fields: Field[] };
type Value = string | number | string[] | null | undefined;
type Sheet = {
  lender: { id: string; name: string };
  sections: Section[];
  data: Record<string, Value>;
  progress: { percent: number; missing: string[] };
  source: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
};

const numeric = (t: string) => t === "money" || t === "percent" || t === "number";

function Input({ f, value, onChange, disabled }: { f: Field; value: Value; onChange: (v: Value) => void; disabled: boolean }) {
  const v = value === null || value === undefined ? "" : Array.isArray(value) ? "" : String(value);
  if (f.type === "multi") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.label}>
        {f.options?.map((o) => {
          const on = picked.includes(o);
          return (
            <button key={o} type="button" disabled={disabled} aria-pressed={on} onClick={() => onChange(on ? picked.filter((x) => x !== o) : [...picked, o])}
              className={clsx("rounded-full border px-2.5 py-1 text-[12px] font-semibold", on ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:bg-bg-light", disabled && "opacity-60")}>
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (f.type === "yesno" || f.type === "select") {
    return (
      <select aria-label={f.label} className="field" disabled={disabled} value={v} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Not given</option>
        {(f.type === "yesno" ? ["Yes", "No"] : f.options)?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (f.type === "longtext") return <textarea aria-label={f.label} rows={2} className="field" disabled={disabled} value={v} onChange={(e) => onChange(e.target.value || null)} />;
  if (f.type === "date") return <input aria-label={f.label} type="date" className="field" disabled={disabled} value={v} onChange={(e) => onChange(e.target.value || null)} />;
  return (
    <input aria-label={f.label} className="field" disabled={disabled} inputMode={numeric(f.type) ? "decimal" : f.type === "phone" ? "tel" : undefined} value={v}
      onChange={(e) => onChange((numeric(f.type) ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value) || null)} />
  );
}

/**
 * A lender's standard policy one-pager: the minimum Home Loan and LAP details we want on every bank. Fields fill in by hand
 * or from a flyer on the Lender offers page; a blank means the bank has not told us.
 */
export function LenderPolicySheet({ lenderId, canEdit }: { lenderId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const key = ["policy-sheet", lenderId];
  const q = useQuery({ queryKey: key, queryFn: () => api<Sheet>(`/lenders/${lenderId}/policy-sheet`) });
  const [draft, setDraft] = useState<Record<string, Value> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (q.data && !dirty && loadedFor.current !== `${q.data.updatedAt}`) {
      loadedFor.current = `${q.data.updatedAt}`;
      setDraft(q.data.data);
    }
  }, [q.data, dirty]);

  const save = useMutation({
    mutationFn: () => api<Sheet>(`/lenders/${lenderId}/policy-sheet`, { method: "PUT", body: JSON.stringify({ data: draft }) }),
    onSuccess: (s) => {
      queryClient.setQueryData(key, s);
      loadedFor.current = `${s.updatedAt}`;
      setDraft(s.data);
      setDirty(false);
    },
  });

  if (q.isLoading || !draft) return <section className="card p-5"><Loader2 className="h-4 w-4 animate-spin text-navy" /></section>;
  if (q.isError || !q.data) return null;
  const s = q.data;
  const filledIn = (sec: Section) => sec.fields.filter((f) => { const v = draft[f.key]; return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length); }).length;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-navy"><ClipboardList className="h-4 w-4" /> Policy one-pager</h2>
          <p className="text-[12px] text-muted">
            The minimum Home Loan and LAP details we keep for {s.lender.name}. Blank means not given yet. {s.updatedAt ? `Last updated ${formatDateTime(s.updatedAt)}${s.updatedByName ? ` by ${s.updatedByName}` : ""}${s.source && s.source !== "Entered by hand" ? ` (${s.source})` : ""}.` : "Nothing recorded yet."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[12px] font-semibold text-navy">{s.progress.percent}% filled</div>
            <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-bg-light"><div className="h-full rounded-full bg-gold" style={{ width: `${s.progress.percent}%` }} /></div>
          </div>
          {canEdit && dirty && (
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
          )}
        </div>
      </div>
      {save.isError && <p className="px-5 pb-2 text-[13px] font-medium text-red-700">{(save.error as Error).message}</p>}
      <div className="divide-y divide-line border-t border-line">
        {s.sections.map((sec) => {
          const isOpen = open === sec.id;
          return (
            <div key={sec.id}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : sec.id)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-bg-light">
                <span className="text-[13px] font-semibold text-navy">{sec.title} <span className="font-normal text-muted">({filledIn(sec)} of {sec.fields.length})</span></span>
                <ChevronDown className={clsx("h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="grid gap-x-4 gap-y-3 px-5 pb-4 sm:grid-cols-2">
                  {sec.fields.map((f) => (
                    <label key={f.key} className={clsx("block", (f.type === "longtext" || f.type === "multi") && "sm:col-span-2")}>
                      <span className="text-[12px] font-semibold text-navy">{f.label}</span>
                      {f.hint && <span className="block text-[11px] text-muted">{f.hint}</span>}
                      <div className="mt-1"><Input f={f} value={draft[f.key]} disabled={!canEdit} onChange={(v) => { setDraft((d) => ({ ...(d ?? {}), [f.key]: v })); setDirty(true); }} /></div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
