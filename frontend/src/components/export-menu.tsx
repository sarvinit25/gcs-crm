import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileSpreadsheet, ListChecks, Loader2, Save, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { downloadReport, type ReportType } from "../lib/download-report";
import {
  applyTemplate,
  groupColumns,
  orderedSelection,
  sectionState,
  selectAll,
  selectionSummary,
  toggleColumn,
  toggleSection,
  type Catalogue,
  type TypeCatalogue,
} from "../lib/report-columns";
import type { ReportTemplate } from "../lib/reports";
import { Modal } from "./modal";

type Filters = Record<string, string | number | undefined>;

export const useCatalogue = () =>
  useQuery({ queryKey: ["report-catalogue"], queryFn: () => api<Catalogue>("/reports/catalogue"), staleTime: 10 * 60_000 });

const useTemplates = (type: ReportType) =>
  useQuery({ queryKey: ["report-templates", type], queryFn: () => api<ReportTemplate[]>(`/reports/templates?type=${type}`) });

/**
 * The Export button on every list and report: a standard Excel file, any of the person's saved column templates,
 * or "Customize report…" to choose columns. Whatever is chosen, the file honours `filters` — the list's own.
 */
export function ExportMenu({
  type,
  filters,
  className,
  align = "right",
}: {
  type: ReportType;
  filters: Filters;
  className?: string;
  align?: "left" | "right";
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const templates = useTemplates(type);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const run = async (id: string, extra: Filters) => {
    setBusy(id);
    setError("");
    try {
      await downloadReport(type, { ...filters, ...extra });
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = useMutation({
    mutationFn: (id: string) => api(`/reports/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["report-templates", type] }),
    onError: (e) => setError((e as Error).message),
  });

  const item = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink transition hover:bg-bg-light disabled:opacity-60";

  return (
    <div ref={box} className={clsx("relative", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost" aria-haspopup="menu" aria-expanded={open}>
        <FileSpreadsheet className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5 text-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className={clsx(
            "card pop-enter absolute z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <button role="menuitem" className={item} disabled={busy !== null} onClick={() => void run("standard", {})}>
            {busy === "standard" ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : <FileSpreadsheet className="h-4 w-4 text-muted" />}
            <span>
              Standard export
              <span className="block text-[11px] text-muted">The usual columns, as Excel</span>
            </span>
          </button>

          <div className="my-1 border-t border-line" />
          <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold tracking-wider text-muted uppercase">Report templates</p>
          {templates.isPending ? (
            <p className="px-3 py-2 text-[12px] text-muted">Loading…</p>
          ) : !templates.data?.length ? (
            <p className="px-3 py-2 text-[12px] text-muted">No saved templates</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {templates.data.map((t) => (
                <li key={t.id} className="group flex items-center hover:bg-bg-light">
                  <button
                    role="menuitem"
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink disabled:opacity-60"
                    disabled={busy !== null}
                    onClick={() => void run(t.id, { templateId: t.id })}
                  >
                    {busy === t.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" /> : <ListChecks className="h-4 w-4 shrink-0 text-muted" />}
                    <span className="min-w-0">
                      <span className="block truncate">{t.name}</span>
                      <span className="block text-[11px] text-muted">{t.columns.length} columns</span>
                    </span>
                  </button>
                  <button
                    aria-label={`Delete template ${t.name}`}
                    title="Delete template"
                    className="mr-2 rounded p-1.5 text-muted transition hover:bg-white hover:text-red-600"
                    onClick={() => window.confirm(`Delete the template “${t.name}”?`) && remove.mutate(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="my-1 border-t border-line" />
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              setCustomizing(true);
            }}
          >
            <SlidersHorizontal className="h-4 w-4 text-muted" /> Customize report…
          </button>
          {error && (
            <p role="alert" className="border-t border-line px-3 py-2 text-[12px] text-red-600">
              {error}
            </p>
          )}
        </div>
      )}

      {customizing && <CustomizeDialog type={type} filters={filters} onClose={() => setCustomizing(false)} />}
    </div>
  );
}

function CustomizeDialog({ type, filters, onClose }: { type: ReportType; filters: Filters; onClose: () => void }) {
  const catalogue = useCatalogue();
  const cat = catalogue.data?.[type];
  return (
    <Modal title="Customize report" subtitle={cat ? `${cat.label} — choose the columns for your Excel file` : undefined} onClose={onClose} maxWidth="max-w-2xl">
      {catalogue.isPending ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading columns…
        </div>
      ) : !cat ? (
        <p className="py-6 text-sm text-red-600">Could not load the columns.</p>
      ) : (
        <Picker cat={cat} type={type} filters={filters} onDone={onClose} />
      )}
    </Modal>
  );
}

function Picker({ cat, type, filters, onDone }: { cat: TypeCatalogue; type: ReportType; filters: Filters; onDone: () => void }) {
  const queryClient = useQueryClient();
  const templates = useTemplates(type);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(cat.standardColumns));
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const groups = groupColumns(cat, search);
  const chosen = orderedSelection(cat, selected);

  const save = useMutation({
    mutationFn: () => api<ReportTemplate>("/reports/templates", { method: "POST", body: JSON.stringify({ type, name: name.trim(), columns: chosen }) }),
    onSuccess: (t) => {
      setError("");
      setNote(`Saved “${t.name}”`);
      void queryClient.invalidateQueries({ queryKey: ["report-templates", type] });
    },
    onError: (e) => {
      setNote("");
      setError((e as Error).message);
    },
  });

  const exporting = useMutation({
    mutationFn: () => downloadReport(type, { ...filters, columns: chosen.join(",") }),
    onSuccess: onDone,
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search columns"
            aria-label="Search columns"
            className="field pl-9"
          />
        </div>
        {templates.data && templates.data.length > 0 && (
          <select
            aria-label="Start from a saved template"
            className="field w-44"
            value=""
            onChange={(e) => {
              const t = templates.data?.find((x) => x.id === e.target.value);
              if (t) {
                setSelected(applyTemplate(cat, t.columns));
                setName(t.name);
              }
            }}
          >
            <option value="">Load a template…</option>
            {templates.data.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <p className="font-semibold text-navy" aria-live="polite">
          {selectionSummary(chosen.length, cat.columns.length)}
        </p>
        <div className="flex gap-1">
          <button type="button" className="rounded px-2 py-1 font-semibold text-navy hover:bg-bg-light" onClick={() => setSelected(selectAll(cat))}>
            Select all
          </button>
          <button type="button" className="rounded px-2 py-1 font-semibold text-muted hover:bg-bg-light hover:text-navy" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      </div>

      <div className="mt-2 max-h-[46vh] overflow-y-auto rounded-lg border border-line">
        {groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">No columns match “{search}”.</p>
        ) : (
          groups.map((g) => {
            const state = sectionState(g, selected);
            return (
              <fieldset key={g.section.id} className="border-b border-line last:border-0">
                <legend className="sr-only">{g.section.label}</legend>
                <label className="flex cursor-pointer items-center gap-2.5 bg-bg-light/70 px-3 py-2 text-[12px] font-bold tracking-wide text-navy uppercase">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-navy"
                    checked={state === "all"}
                    ref={(el) => {
                      if (el) el.indeterminate = state === "some";
                    }}
                    onChange={() => setSelected(toggleSection(g, selected))}
                    aria-label={`Select all ${g.section.label} columns`}
                  />
                  {g.section.label}
                  <span className="font-normal text-muted normal-case">
                    {g.columns.filter((c) => selected.has(c.key)).length}/{g.columns.length}
                  </span>
                </label>
                <div className="grid gap-x-4 px-3 py-2 sm:grid-cols-2">
                  {g.columns.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded py-1.5 text-[13px] text-ink hover:text-navy">
                      <input type="checkbox" className="h-4 w-4 shrink-0 accent-navy" checked={selected.has(c.key)} onChange={() => setSelected(toggleColumn(c.key, selected))} />
                      <span className="truncate">{c.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="template-name" className="text-[11px] font-bold tracking-wide text-muted uppercase">
            Template name
          </label>
          <div className="mt-1 flex gap-2">
            <input id="template-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Monthly lender sheet" className="field" />
            <button
              type="button"
              className="btn-ghost shrink-0"
              disabled={!name.trim() || chosen.length === 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save template
            </button>
          </div>
        </div>
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={chosen.length === 0 || exporting.isPending} onClick={() => exporting.mutate()}>
          {exporting.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Export {chosen.length} {chosen.length === 1 ? "column" : "columns"}
        </button>
      </div>
      {note && <p className="mt-2 text-[12px] text-emerald-700" role="status">{note}</p>}
      {error && (
        <p className="mt-2 text-[12px] text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
