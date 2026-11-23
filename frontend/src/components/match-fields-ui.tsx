import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

// Staff-defined match fields: the questions a lender policy can test (mirrors backend/src/lender-policies/match-fields.ts).

export type FieldType = "NUMBER" | "YESNO" | "CHOICE" | "TEXT";
export type MatchField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  unit: string | null;
  hint: string | null;
  answerLabel: string | null;
  products: string[];
  applicants: string[];
  mandatory: boolean;
  minValue: number | null;
  maxValue: number | null;
  active: boolean;
};
export type CriterionOp = "gte" | "lte" | "eq" | "in" | "yes" | "no";
export type Criterion = { op: CriterionOp; value?: number | string | string[] };
export type Criteria = Record<string, Criterion>;

const TYPE_LABEL: Record<FieldType, string> = { NUMBER: "A number", YESNO: "Yes / No", CHOICE: "One of a list", TEXT: "Free text" };
const OPS: Record<FieldType, { op: CriterionOp; label: string }[]> = {
  NUMBER: [{ op: "gte", label: "at least" }, { op: "lte", label: "at most" }, { op: "eq", label: "exactly" }],
  YESNO: [{ op: "yes", label: "must be Yes" }, { op: "no", label: "must be No" }],
  CHOICE: [{ op: "in", label: "is one of" }, { op: "eq", label: "is" }],
  TEXT: [{ op: "eq", label: "is" }],
};

export function useMatchFields() {
  return useQuery({ queryKey: ["match-fields"], queryFn: () => api<MatchField[]>("/lender-policies/fields"), staleTime: 60_000 });
}

const lbl = "text-[12px] font-semibold text-navy";

/** Manager: add, edit, switch off or delete the fields. Shown to staff who can change policies. */
export function MatchFieldsManager({ products }: { products: { slug: string; name: string }[] }) {
  const queryClient = useQueryClient();
  const fields = useMatchFields();
  const [editing, setEditing] = useState<MatchField | "new" | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api(`/lender-policies/fields/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["match-fields"] });
      void queryClient.invalidateQueries({ queryKey: ["lender-policies"] });
    },
  });
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-navy">Match fields</h2>
          <p className="text-[12px] text-muted">Questions about the customer that a lender can set a rule on, without changing any code. Add one here, then set the lender's rule on it when you edit a policy.</p>
        </div>
        <button className="btn-primary shrink-0" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add field</button>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {(fields.data ?? []).map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
            <div className="min-w-0">
              <p className={clsx("font-semibold", f.active ? "text-navy" : "text-muted line-through")}>{f.label}{f.mandatory && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Must answer</span>}</p>
              <p className="text-[12px] text-muted">{TYPE_LABEL[f.type]}{f.unit ? ` (${f.unit})` : ""}{f.options.length ? `: ${f.options.join(", ")}` : ""}{f.products.length ? ` · only ${f.products.join(", ")}` : " · all loans"}{f.applicants.length ? ` · ${f.applicants.map((a) => (a === "SALARIED" ? "salaried" : "self-employed")).join(" and ")} only` : ""}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="text-navy" title="Edit" onClick={() => setEditing(f)}><Pencil className="h-4 w-4" /></button>
              <button className="text-red-600" title="Delete" disabled={del.isPending} onClick={() => { if (confirm(`Delete "${f.label}"? Every lender rule that uses it is removed too.`)) del.mutate(f.id); }}><Trash2 className="h-4 w-4" /></button>
            </div>
          </li>
        ))}
        {fields.isSuccess && fields.data.length === 0 && <li className="py-3 text-[13px] text-muted">No fields yet. Examples: "Number of credit cards", "Any EMI overdue", "Employer type".</li>}
      </ul>
      {editing && <FieldForm field={editing === "new" ? undefined : editing} products={products} onClose={() => setEditing(null)} />}
    </section>
  );
}

function FieldForm({ field, products, onClose }: { field?: MatchField; products: { slug: string; name: string }[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<FieldType>(field?.type ?? "NUMBER");
  const [applicants, setApplicants] = useState<string[]>(field?.applicants ?? []);
  const [prods, setProds] = useState<string[]>(field?.products ?? []);
  const [err, setErr] = useState("");
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (field ? api(`/lender-policies/fields/${field.id}`, { method: "PATCH", body: JSON.stringify(body) }) : api("/lender-policies/fields", { method: "POST", body: JSON.stringify(body) })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["match-fields"] });
      onClose();
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Could not save"),
  });
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const t = (k: string) => String(f.get(k) ?? "").trim();
    const n = (k: string) => (t(k) === "" ? null : Number(t(k)));
    save.mutate({
      label: t("label"),
      type,
      options: t("options").split(/[,\n]/).map((x) => x.trim()).filter(Boolean),
      unit: t("unit") || null,
      hint: t("hint") || null,
      answerLabel: t("answerLabel") || null,
      products: prods,
      applicants,
      mandatory: f.get("mandatory") === "on",
      minValue: n("minValue"),
      maxValue: n("maxValue"),
      active: f.get("active") === "on",
    });
  };
  return (
    <div className="mt-4 rounded-xl border border-line bg-slate-50 p-4">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>Question<input name="label" required defaultValue={field?.label} className="field mt-1 font-normal" placeholder="Number of credit cards" /></label>
        <label className={lbl}>Answer type
          <select value={type} disabled={Boolean(field)} onChange={(e) => setType(e.target.value as FieldType)} className="field mt-1 font-normal">
            {(Object.keys(TYPE_LABEL) as FieldType[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
          </select>
        </label>
        {type === "CHOICE" && <label className={clsx(lbl, "sm:col-span-2")}>Options (comma separated)<input name="options" defaultValue={field?.options.join(", ")} className="field mt-1 font-normal" placeholder="Government, MNC, Private" /></label>}
        {type === "NUMBER" && (
          <>
            <label className={lbl}>Unit (optional)<input name="unit" defaultValue={field?.unit ?? ""} className="field mt-1 font-normal" placeholder="cards, months, lakh" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className={lbl}>Lowest allowed<input name="minValue" type="number" step="any" defaultValue={field?.minValue ?? ""} className="field mt-1 font-normal" /></label>
              <label className={lbl}>Highest allowed<input name="maxValue" type="number" step="any" defaultValue={field?.maxValue ?? ""} className="field mt-1 font-normal" /></label>
            </div>
          </>
        )}
        <label className={clsx(lbl, "sm:col-span-2")}>Read the answer from this enquiry question (optional)<input name="answerLabel" defaultValue={field?.answerLabel ?? ""} className="field mt-1 font-normal" placeholder="Exactly as the question is worded in the form or WhatsApp chat" /></label>
        <label className={clsx(lbl, "sm:col-span-2")}>Note for staff (optional)<input name="hint" defaultValue={field?.hint ?? ""} className="field mt-1 font-normal" /></label>
        <fieldset className="sm:col-span-2">
          <legend className={lbl}>Applies to applicants (none ticked = everyone)</legend>
          <div className="mt-1 flex gap-4 text-[13px]">
            {[["SALARIED", "Salaried"], ["SELF_EMPLOYED", "Self-employed"]].map(([v, l]) => <label key={v} className="flex items-center gap-1.5"><input type="checkbox" checked={applicants.includes(v!)} onChange={() => toggle(applicants, setApplicants, v!)} /> {l}</label>)}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className={lbl}>Applies to loans (none ticked = all loans)</legend>
          <div className="mt-1 flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto text-[13px]">
            {products.map((p) => <label key={p.slug} className="flex items-center gap-1.5"><input type="checkbox" checked={prods.includes(p.slug)} onChange={() => toggle(prods, setProds, p.slug)} /> {p.name}</label>)}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-navy"><input name="mandatory" type="checkbox" defaultChecked={field?.mandatory} /> Must be answered before a lender can be called Eligible</label>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-navy"><input name="active" type="checkbox" defaultChecked={field?.active ?? true} /> In use</label>
        {err && <p className="text-[13px] font-semibold text-red-600 sm:col-span-2">{err}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save field</button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

/** In the policy editor: one optional rule per active field. */
export function CriteriaEditor({ value, onChange }: { value: Criteria; onChange: (v: Criteria) => void }) {
  const fields = useMatchFields();
  const active = (fields.data ?? []).filter((f) => f.active);
  if (!active.length) return <p className="text-[12px] text-muted sm:col-span-2">No match fields are set up yet. Add them under "Match fields" at the top of this page.</p>;
  const set = (key: string, c: Criterion | null) => {
    const next = { ...value };
    if (c) next[key] = c;
    else delete next[key];
    onChange(next);
  };
  return (
    <div className="space-y-2 sm:col-span-2">
      {active.map((f) => {
        const c = value[f.key];
        const ops = OPS[f.type];
        return (
          <div key={f.key} className="grid items-end gap-2 sm:grid-cols-[1.4fr_1fr_1.4fr]">
            <p className="text-[13px] font-semibold text-navy">{f.label}{f.hint && <span className="block text-[11px] font-normal text-muted">{f.hint}</span>}</p>
            <select value={c?.op ?? ""} onChange={(e) => (e.target.value ? set(f.key, { op: e.target.value as CriterionOp, value: c?.value }) : set(f.key, null))} className="field">
              <option value="">No rule</option>
              {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {c && c.op !== "yes" && c.op !== "no" ? (
              f.type === "NUMBER" ? (
                <input type="number" step="any" value={String(c.value ?? "")} onChange={(e) => set(f.key, { op: c.op, value: e.target.value === "" ? undefined : Number(e.target.value) })} className="field" placeholder={f.unit ?? "Value"} />
              ) : f.type === "CHOICE" && c.op === "in" ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                  {f.options.map((o) => {
                    const list = Array.isArray(c.value) ? c.value : [];
                    return <label key={o} className="flex items-center gap-1"><input type="checkbox" checked={list.includes(o)} onChange={() => set(f.key, { op: "in", value: list.includes(o) ? list.filter((x) => x !== o) : [...list, o] })} /> {o}</label>;
                  })}
                </div>
              ) : f.type === "CHOICE" ? (
                <select value={String(c.value ?? "")} onChange={(e) => set(f.key, { op: "eq", value: e.target.value })} className="field"><option value="">Choose</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
              ) : (
                <input value={String(c.value ?? "")} onChange={(e) => set(f.key, { op: "eq", value: e.target.value })} className="field" />
              )
            ) : <span />}
          </div>
        );
      })}
    </div>
  );
}

/** In the match panel: an input per field that applies, so the person can answer what the enquiry did not. */
export function FieldInputs({ values, onChange, product, employmentType }: { values: Record<string, string>; onChange: (v: Record<string, string>) => void; product?: string; employmentType?: string }) {
  const fields = useMatchFields();
  const shown = (fields.data ?? []).filter((f) => f.active && (!f.products.length || !product || f.products.includes(product)) && (!f.applicants.length || !employmentType || f.applicants.includes(employmentType)));
  if (!shown.length) return null;
  const set = (k: string, v: string) => onChange({ ...values, [k]: v });
  return (
    <>
      {shown.map((f) => (
        <label key={f.key} className="text-[12px] font-semibold text-navy">
          {f.label}{f.mandatory && <span className="text-red-600"> *</span>}{f.unit ? ` (${f.unit})` : ""}
          {f.type === "YESNO" || f.type === "CHOICE" ? (
            <select value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="field mt-1 font-normal">
              <option value="">Not known</option>
              {(f.type === "YESNO" ? ["Yes", "No"] : f.options).map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type === "NUMBER" ? "number" : "text"} step="any" min={f.minValue ?? undefined} max={f.maxValue ?? undefined} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="field mt-1 font-normal" />
          )}
        </label>
      ))}
    </>
  );
}
