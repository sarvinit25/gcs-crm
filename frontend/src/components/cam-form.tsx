import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { blank, sectionProgress, visible, type CamColumn, type CamData, type CamField, type CamSection, type CamTable } from "../lib/cam";

type Row = Record<string, unknown>;

const inputMode = (t: string) => (t === "money" || t === "number" || t === "percent" ? "decimal" : t === "phone" ? "tel" : undefined);

/** One answer's input, by type. Money shows plain digits while typing and Indian grouping underneath. */
function Input({ type, value, options, onChange, label, compact }: { type: string; value: unknown; options?: string[]; onChange: (v: string) => void; label: string; compact?: boolean }) {
  const v = value === null || value === undefined ? "" : String(value);
  const cls = clsx("field", compact && "!py-1.5 text-[13px]");
  if (type === "select") {
    return (
      <select aria-label={label} className={cls} value={v} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (type === "yesno") {
    return (
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {["Yes", "No"].map((o) => (
          <button key={o} type="button" role="radio" aria-checked={v === o} onClick={() => onChange(v === o ? "" : o)}
            className={clsx("min-w-16 rounded-lg border px-3 py-1.5 text-[13px] font-semibold", v === o ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:bg-bg-light")}>
            {o}
          </button>
        ))}
      </div>
    );
  }
  if (type === "longtext") return <textarea aria-label={label} rows={3} className={cls} value={v} onChange={(e) => onChange(e.target.value)} />;
  if (type === "date") return <input aria-label={label} type="date" className={cls} value={v} onChange={(e) => onChange(e.target.value)} />;
  const grouped = type === "money" && v !== "" && Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-IN") : null;
  return (
    <div>
      <input aria-label={label} inputMode={inputMode(type)} type={type === "email" ? "email" : "text"} className={cls} value={v}
        onChange={(e) => onChange(type === "money" || type === "number" || type === "percent" ? e.target.value.replace(/[^0-9.\-]/g, "") : e.target.value)} />
      {grouped && !compact && <p className="mt-0.5 text-[11px] text-muted">₹ {grouped}</p>}
    </div>
  );
}

function FieldRow({ f, value, onChange }: { f: CamField; value: unknown; onChange: (v: string) => void }) {
  return (
    <label className={clsx("block", f.type === "longtext" && "sm:col-span-2")}>
      <span className="text-[13px] font-semibold text-navy">{f.label}{f.core && <span className="ml-0.5 text-red-600">*</span>}</span>
      {f.hint && <span className="block text-[11px] text-muted">{f.hint}</span>}
      <div className="mt-1">
        {f.type === "yesno" ? <Input type={f.type} value={value} onChange={onChange} label={f.label} /> : <Input type={f.type} value={value} options={f.options} onChange={onChange} label={f.label} />}
      </div>
    </label>
  );
}

function TableEditor({ t, rows, onChange }: { t: CamTable; rows: Row[]; onChange: (rows: Row[]) => void }) {
  const shown = rows.length ? rows : Array.from({ length: t.startRows ?? 1 }, () => ({}) as Row);
  const set = (i: number, key: string, v: string) => {
    const next = shown.map((r, j) => (j === i ? { ...r, [key]: v } : r));
    onChange(next);
  };
  return (
    <div className="sm:col-span-2">
      <p className="text-[13px] font-semibold text-navy">{t.label}</p>
      {t.hint && <p className="text-[11px] text-muted">{t.hint}</p>}
      <div className="mt-2 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-max text-[13px]">
          <thead>
            <tr className="bg-bg-light text-left text-[11px] tracking-wide text-muted uppercase">
              {t.columns.map((c: CamColumn) => <th key={c.key} className="px-2 py-2 font-semibold">{c.label}</th>)}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-t border-line align-top">
                {t.columns.map((c) => (
                  <td key={c.key} className="min-w-28 px-1.5 py-1.5">
                    <Input compact type={c.type} value={r[c.key]} options={c.options} label={`${t.label}: ${c.label}, row ${i + 1}`} onChange={(v) => set(i, c.key, v)} />
                  </td>
                ))}
                <td className="px-1 py-1.5">
                  <button type="button" aria-label={`Remove row ${i + 1}`} className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-red-700" onClick={() => onChange(shown.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length < t.maxRows && (
        <button type="button" className="btn-ghost mt-2" onClick={() => onChange([...shown, {}])}>
          <Plus className="h-4 w-4" /> Add a row
        </button>
      )}
    </div>
  );
}

/**
 * The CAM questions, section by section. Used by the staff screen and by the customer's link: the parent owns the
 * answers (`data`) and hears every change through `onChange(sectionId, key, value)`.
 */
export function CamForm({ sections, data, onChange, defaultOpen }: { sections: CamSection[]; data: CamData; onChange: (section: string, key: string, value: unknown) => void; defaultOpen?: string }) {
  const [open, setOpen] = useState<string | null>(defaultOpen ?? sections[0]?.id ?? null);
  return (
    <div className="space-y-3">
      {sections.filter((s) => visible(s.show, data)).map((s) => {
        const { done, total } = sectionProgress(s, data);
        const isOpen = open === s.id;
        return (
          <section key={s.id} className="card overflow-hidden">
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
              <span>
                <span className="block text-sm font-bold text-navy">{s.title}{!s.customer && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase">Staff only</span>}</span>
                <span className="block text-[12px] text-muted">{done} of {total} answered</span>
              </span>
              <ChevronDown className={clsx("h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="border-t border-line px-4 pt-3 pb-5">
                {s.intro && <p className="mb-3 text-[13px] text-muted">{s.intro}</p>}
                <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
                  {s.fields.filter((f) => visible(f.show, data)).map((f) => (
                    <FieldRow key={f.key} f={f} value={data[s.id]?.[f.key]} onChange={(v) => onChange(s.id, f.key, v)} />
                  ))}
                  {s.tables.filter((t) => visible(t.show, data)).map((t) => (
                    <TableEditor key={t.key} t={t} rows={((data[s.id]?.[t.key] as Row[] | undefined) ?? []).filter((r) => !blank(r))} onChange={(rows) => onChange(s.id, t.key, rows)} />
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
