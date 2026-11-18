import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import {
  DIVISIONS,
  ICON_OPTIONS,
  buildSettings,
  categoryList,
  firstProblem,
  slugify,
  toLines,
  type CaLegalSettings,
  type CustomService,
  type Division,
} from "../lib/ca-legal";
import { Switch } from "./switch";

type Saved = { key: string; value: unknown; updatedAt: string; updatedByName: string | null };
type Defaults = { services?: Record<string, { division?: string; title?: string }> };

/** A service being edited: steps and documents are typed one per line, so they are kept as text until saving. */
type Row = Omit<CustomService, "process" | "documents"> & { id: number; processText: string; documentsText: string; slugTouched: boolean };

let nextId = 1;
const toRow = (s: CustomService, slugTouched = true): Row => ({
  id: nextId++,
  slug: s.slug,
  division: s.division,
  category: s.category,
  title: s.title,
  summary: s.summary,
  whoNeedsIt: s.whoNeedsIt ?? "",
  icon: s.icon ?? "document",
  processText: (s.process ?? []).join("\n"),
  documentsText: (s.documents ?? []).join("\n"),
  slugTouched,
});
const fromRow = (r: Row): CustomService => ({
  slug: r.slug,
  division: r.division,
  category: r.category,
  title: r.title,
  summary: r.summary,
  whoNeedsIt: r.whoNeedsIt ?? "",
  icon: r.icon ?? "document",
  process: toLines(r.processText),
  documents: toLines(r.documentsText),
});

function Card({ title, hint, right, children }: { title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-navy">{title}</h2>
          {hint && <p className="mt-0.5 max-w-2xl text-[12px] text-muted">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const Label = ({ text, children }: { text: string; children: React.ReactNode }) => (
  <label className="block text-[12px] font-semibold text-navy">
    {text}
    <div className="mt-1 font-normal">{children}</div>
  </label>
);

export function CaLegalManager() {
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ["site-content"], queryFn: () => api<Saved[]>("/settings/site-content") });
  const defaults = useQuery({ queryKey: ["site-content-defaults"], queryFn: () => api<Defaults>("/settings/site-content/defaults") });

  const builtIn = useMemo(
    () => Object.entries(defaults.data?.services ?? {}).map(([slug, v]) => ({ slug, title: v.title ?? slug, division: (v.division ?? "CA Services") as Division })),
    [defaults.data],
  );
  const builtInSlugs = useMemo(() => builtIn.map((b) => b.slug), [builtIn]);

  const row = saved.data?.find((s) => s.key === "caLegal");
  const current = useMemo(() => (row?.value ?? {}) as CaLegalSettings, [row]);

  const [rows, setRows] = useState<Row[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [blurbs, setBlurbs] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const load = () => {
    setRows((current.custom ?? []).map((s) => toRow(s)));
    setHidden(current.hidden ?? []);
    setBlurbs(current.blurbs ?? {});
  };
  useEffect(() => {
    if (saved.isSuccess && !ready) {
      load();
      setReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.isSuccess]);

  const custom = rows.map(fromRow);
  const payload = buildSettings(custom, hidden, blurbs);
  const dirty = JSON.stringify(payload) !== JSON.stringify(buildSettings(current.custom ?? [], current.hidden ?? [], current.blurbs ?? {}));
  const problem = firstProblem(custom, builtInSlugs);

  const save = useMutation({
    mutationFn: () =>
      Object.keys(payload).length === 0
        ? api("/settings/site-content/caLegal", { method: "DELETE" })
        : api("/settings/site-content/caLegal", { method: "PUT", body: JSON.stringify({ value: payload }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["site-content"] });
    },
  });

  if (saved.isPending || defaults.isPending || !ready) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const setHide = (slug: string, show: boolean) => setHidden((h) => (show ? h.filter((x) => x !== slug) : [...new Set([...h, slug])]));
  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (r: Row) => {
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    setHidden((h) => h.filter((x) => x !== r.slug));
  };
  const add = () =>
    setRows((rs) => [...rs, toRow({ slug: "", division: "Legal Services", category: "", title: "", summary: "", icon: "document" }, false)]);
  const categories = categoryList(custom);
  const error = save.error as Error | null;

  return (
    <div className="space-y-4">
      <div className="sticky top-[9.25rem] z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/95 px-4 py-3 backdrop-blur">
        <p className="text-[13px] text-muted">
          {dirty ? "You have changes that are not on the website yet." : "Everything here is live on the website."}
          {row && !dirty && ` Last saved ${new Date(row.updatedAt).toLocaleString("en-IN")}${row.updatedByName ? ` by ${row.updatedByName}` : ""}.`}
        </p>
        <div className="flex items-center gap-2">
          <a href="https://growthcapitalservices.in/ca-legal-services" target="_blank" rel="noreferrer" className="btn-ghost">
            <ExternalLink className="h-4 w-4" /> View on website
          </a>
          <button className="btn-ghost" disabled={!dirty || save.isPending} onClick={load}>
            <Undo2 className="h-4 w-4" /> Discard
          </button>
          <button className="btn-primary" disabled={!dirty || save.isPending || Boolean(problem)} onClick={() => save.mutate()} title={problem ?? undefined}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save and publish
          </button>
        </div>
      </div>
      {problem && dirty && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{problem}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error.message}</p>}

      <Card
        title="Services on the website"
        hint="Turn a service off to take it off the CA & Legal pages and the header menu, without deleting it. Change a service's wording in the “Page & service text” tab."
      >
        {DIVISIONS.map((d) => (
          <div key={d} className="mb-4 last:mb-0">
            <p className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">{d}</p>
            <ul className="divide-y divide-line/70 rounded-lg border border-line">
              {builtIn
                .filter((b) => b.division === d)
                .map((b) => (
                  <li key={b.slug} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className={clsx("text-[13px]", hidden.includes(b.slug) ? "text-muted line-through" : "text-ink")}>{b.title}</span>
                    <Switch checked={!hidden.includes(b.slug)} onChange={(v) => setHide(b.slug, v)} label={`Show ${b.title} on the website`} />
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </Card>

      <Card
        title="Services you added"
        hint="A new service gets its own page on the website and a place in the header menu. It uses the short layout: description, who needs it, steps and documents."
        right={
          <button className="btn-ghost" onClick={add}>
            <Plus className="h-4 w-4" /> Add a service
          </button>
        }
      >
        {rows.length === 0 && <p className="py-4 text-center text-[13px] text-muted">No added services yet.</p>}
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-line p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Label text="Title">
                  <input
                    className="field w-full"
                    value={r.title}
                    maxLength={120}
                    onChange={(e) => patch(r.id, { title: e.target.value, ...(r.slugTouched ? {} : { slug: slugify(e.target.value) }) })}
                    placeholder="For example, Rent agreement and registration"
                  />
                </Label>
                <Label text="Website address">
                  <div className="flex items-center gap-1 text-[12px] text-muted">
                    <span className="shrink-0">/ca-legal-services/</span>
                    <input className="field w-full font-mono text-[12px]" value={r.slug} maxLength={80} onChange={(e) => patch(r.id, { slug: e.target.value.toLowerCase(), slugTouched: true })} />
                  </div>
                </Label>
                <Label text="Team">
                  <select className="field w-full" value={r.division} onChange={(e) => patch(r.id, { division: e.target.value as Division })}>
                    {DIVISIONS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </Label>
                <Label text="Category (shown in the header menu)">
                  <input className="field w-full" list="ca-legal-categories" value={r.category} maxLength={60} onChange={(e) => patch(r.id, { category: e.target.value })} placeholder="Pick one or type a new one" />
                </Label>
                <Label text="Icon">
                  <select className="field w-full" value={r.icon} onChange={(e) => patch(r.id, { icon: e.target.value })}>
                    {ICON_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Label>
                <div className="flex items-end justify-between gap-3">
                  <span className="text-[12px] font-semibold text-navy">Show on the website</span>
                  <Switch checked={!hidden.includes(r.slug)} onChange={(v) => setHide(r.slug, v)} label={`Show ${r.title || "this service"} on the website`} disabled={!r.slug} />
                </div>
              </div>
              <div className="mt-3 grid gap-3">
                <Label text="Short description">
                  <textarea className="field w-full" rows={3} value={r.summary} maxLength={1500} onChange={(e) => patch(r.id, { summary: e.target.value })} />
                </Label>
                <Label text="Who needs it">
                  <textarea className="field w-full" rows={2} value={r.whoNeedsIt ?? ""} maxLength={1500} onChange={(e) => patch(r.id, { whoNeedsIt: e.target.value })} />
                </Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Label text="Steps (one per line)">
                    <textarea className="field w-full" rows={4} value={r.processText} onChange={(e) => patch(r.id, { processText: e.target.value })} />
                  </Label>
                  <Label text="Documents needed (one per line)">
                    <textarea className="field w-full" rows={4} value={r.documentsText} onChange={(e) => patch(r.id, { documentsText: e.target.value })} />
                  </Label>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-700 hover:underline" onClick={() => remove(r)}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove this service
                </button>
              </div>
            </div>
          ))}
        </div>
        <datalist id="ca-legal-categories">
          {categories.map((c) => (
            <option key={c.category} value={c.category} />
          ))}
        </datalist>
      </Card>

      <Card title="Header menu" hint="The line under each category in the website's CA & Legal menu. Leave a box empty to keep the website's own line.">
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((c) => (
            <Label key={c.category} text={c.added ? `${c.category} (new)` : c.category}>
              <input className="field w-full" maxLength={120} value={blurbs[c.category] ?? ""} placeholder={c.desc || "A few words about this category"} onChange={(e) => setBlurbs((b) => ({ ...b, [c.category]: e.target.value }))} />
            </Label>
          ))}
        </div>
      </Card>
    </div>
  );
}
