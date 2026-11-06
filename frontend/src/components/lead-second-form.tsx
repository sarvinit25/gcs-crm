import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Save } from "lucide-react";
import { api } from "../lib/api";

type Field = {
  key: string;
  label: string;
  kind: "text" | "choice" | "multi" | "amount" | "percent" | string;
  options?: string[];
  showWhen?: { key: string; values: string[] };
  required?: boolean;
  help?: string;
};
type Questions = { loanSlug: string | null; title: string | null; fields: Field[]; values: Record<string, string> };

const choiceOf = (v: string | undefined) => (v ?? "").replace(/^Other \(.*\)$/, "Other");

/** Is this question showing, given the answers so far? Same rule as the website's second form. */
function showing(fields: Field[], f: Field, values: Record<string, string>, depth = 0): boolean {
  if (!f.showWhen) return true;
  if (depth > 8) return false;
  const controller = fields.find((x) => x.key === f.showWhen!.key);
  if (controller && !showing(fields, controller, values, depth + 1)) return false;
  return f.showWhen.values.includes(choiceOf(values[f.showWhen.key]));
}

/**
 * The loan's second form, filled in over time: save any answers now, come back and add more later.
 * Answers are kept on the lead exactly like the ones the customer gave on the website or WhatsApp.
 */
export function LeadSecondForm({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["lead-form-questions", leadId], queryFn: () => api<Questions>(`/leads/${leadId}/form-questions`) });
  const save = useMutation({
    mutationFn: () => api<Questions>(`/leads/${leadId}/form-answers`, { method: "PATCH", body: JSON.stringify({ values: edits }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["lead-form-questions", leadId], data);
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      setEdits({});
    },
  });

  const data = q.data;
  if (!data) return null;
  if (!data.title) {
    return (
      <section className="card p-5">
        <h2 className="text-sm font-bold text-navy">Second form</h2>
        <p className="mt-2 text-[13px] text-muted">Pick a loan type for this lead to see that loan's questions.</p>
      </section>
    );
  }

  const values = { ...data.values, ...edits };
  const visible = data.fields.filter((f) => showing(data.fields, f, values));
  const answered = visible.filter((f) => (values[f.key] ?? "").trim() !== "").length;
  const dirty = Object.keys(edits).length > 0;
  const set = (key: string, v: string) => setEdits((e) => ({ ...e, [key]: v }));

  return (
    <section className="card p-5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span>
          <span className="block text-sm font-bold text-navy">Second form · {data.title}</span>
          <span className="block text-[12px] text-muted">
            {answered} of {visible.length} answered. Fill in what you know now and add the rest later.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {visible.map((f) => {
            const v = values[f.key] ?? "";
            return (
              <label key={f.key} className="grid gap-1 text-[12px] font-semibold text-navy sm:[&:has(textarea)]:col-span-2">
                <span>{f.label}</span>
                {f.kind === "choice" ? (
                  <select value={v} onChange={(e) => set(f.key, e.target.value)} className="field font-normal">
                    <option value="">Not answered</option>
                    {v && !(f.options ?? []).includes(v) && <option value={v}>{v}</option>}
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.kind === "multi" ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-line px-3 py-2 font-normal">
                    {(f.options ?? []).map((o) => {
                      const picked = v.split(",").map((x) => x.trim()).filter(Boolean);
                      return (
                        <label key={o} className="inline-flex items-center gap-1.5 text-[13px]">
                          <input
                            type="checkbox"
                            checked={picked.includes(o)}
                            onChange={(e) => set(f.key, (e.target.checked ? [...picked, o] : picked.filter((p) => p !== o)).join(", "))}
                          />
                          {o}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    value={v}
                    onChange={(e) => set(f.key, e.target.value)}
                    inputMode={f.kind === "amount" || f.kind === "percent" ? "decimal" : undefined}
                    placeholder={f.kind === "amount" ? "Amount in rupees, e.g. 4000000" : f.kind === "percent" ? "Percentage, e.g. 10" : f.help ?? ""}
                    maxLength={300}
                    className="field font-normal"
                  />
                )}
              </label>
            );
          })}

          {save.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:col-span-2">{(save.error as Error).message}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            {dirty && (
              <button type="button" className="btn-ghost" onClick={() => setEdits({})}>
                Discard changes
              </button>
            )}
            <button type="button" className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save answers
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
