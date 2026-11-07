import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatAmount, formatCompact, formatDate, formatIndianNumber } from "../lib/format";
import { SERIES } from "../lib/charts";
import { EXPORT_EXTRA, EXPORT_TYPE, NO_FILTERS, filtersActive, type Detail, type DetailFilters } from "../lib/reports";
import type { Lender } from "../lib/types";
import { downloadReport, type ReportType } from "../lib/download-report";
import { PageHeader } from "../components/app-shell";
import { DatePicker } from "../components/date-picker";
import { ExportMenu } from "../components/export-menu";
import { ChartCard, ColumnChart, DonutChart, HBarChart } from "../components/charts";
import { TableSkeleton } from "../components/skeleton";
import { useChannels } from "../components/channel-field";

const tileValue = (t: { value: number; kind: "count" | "amount" }) => (t.kind === "amount" ? formatCompact(t.value) : formatIndianNumber(t.value));

export function ReportDetailPage() {
  const { kind } = useParams({ strict: false }) as { kind: string };
  return <ReportPanel kind={kind} page />;
}

/** One detailed report: filter bar, charts, tables and the records behind them. Used as a page and inside the hub's Stage reports tab. */
export function ReportPanel({ kind, page = false }: { kind: string; page?: boolean }) {
  const [draft, setDraft] = useState<DetailFilters>(NO_FILTERS);
  const [applied, setApplied] = useState<DetailFilters>(NO_FILTERS);

  const lenders = useQuery({ queryKey: ["lenders"], queryFn: () => api<Lender[]>("/lenders") });
  const channels = useChannels();
  const partners = useQuery({ queryKey: ["partners-assignable"], queryFn: () => api<{ id: string; name: string }[]>("/partners/assignable") });

  const params = { from: applied.from, to: applied.to, lenderId: applied.lenderId, channel: applied.channel, partnerId: applied.partnerId };
  const query = useQuery({
    queryKey: ["report-detail", kind, params],
    queryFn: () => api<Detail>(`/reports/detail/${kind}${qs(params)}`),
    placeholderData: (prev) => prev,
    retry: false,
  });

  const set = (patch: Partial<DetailFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const reset = () => {
    setDraft(NO_FILTERS);
    setApplied(NO_FILTERS);
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const d = query.data;
  const exportType = (EXPORT_TYPE[kind] ?? "applications") as ReportType;
  // The export uses the filters on screen, so the file matches the report.
  const exportFilters = { ...params, ...EXPORT_EXTRA[kind] };
  const csv = useMutation({ mutationFn: () => downloadReport(exportType, exportFilters, "csv") });

  return (
    <>
      {page && (
        <PageHeader
          title={d?.title ?? "Report"}
          subtitle={d ? `${d.blurb} · ${d.rangeLabel}` : undefined}
          actions={
            <Link to={"/reports" as never} className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> All reports
            </Link>
          }
        />
      )}

      <div className={page ? "px-4 py-5 sm:px-6" : undefined}>
        <form
          className="card mb-5 flex flex-wrap items-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(draft);
          }}
        >
          <Field label="From date">
            <DatePicker value={draft.from} onChange={(v) => set({ from: v })} max={draft.to || undefined} className="w-full sm:w-40" placeholder="From date" />
          </Field>
          <Field label="To date">
            <DatePicker value={draft.to} onChange={(v) => set({ to: v })} min={draft.from || undefined} className="w-full sm:w-40" placeholder="To date" />
          </Field>
          <Field label="Lender">
            <select value={draft.lenderId} onChange={(e) => set({ lenderId: e.target.value })} className="field w-full sm:w-44">
              <option value="">All lenders</option>
              {lenders.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lead source">
            <select value={draft.channel} onChange={(e) => set({ channel: e.target.value })} className="field w-full sm:w-44">
              <option value="">All sources</option>
              {channels.data?.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sourcing partner">
            <select value={draft.partnerId} onChange={(e) => set({ partnerId: e.target.value })} className="field w-full sm:w-44">
              <option value="">All partners</option>
              {partners.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn-primary" disabled={!dirty}>
              Apply
            </button>
            <button type="button" className="btn-ghost" onClick={reset} disabled={!filtersActive(draft) && !filtersActive(applied)}>
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <button
              type="button"
              className="btn-ghost"
              disabled={csv.isPending}
              onClick={() => csv.mutate()}
              title="Download every matching record as a CSV file"
            >
              {csv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Export CSV
            </button>
            <ExportMenu type={exportType} filters={exportFilters} />
          </div>
        </form>

        {query.isPending ? (
          <div className="card">
            <TableSkeleton rows={5} cols={4} />
          </div>
        ) : query.isError || !d ? (
          <p className="py-10 text-sm text-red-600">{(query.error as Error | null)?.message ?? "Could not load this report."}</p>
        ) : (
          <div className={clsx("space-y-5 transition-opacity", query.isFetching && "opacity-60")} aria-busy={query.isFetching}>
            <DetailBody d={d} />
            <RecordsTable type={exportType} filters={exportFilters} />
          </div>
        )}
        {query.isFetching && !query.isPending && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
          </p>
        )}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-full sm:w-auto">
      <span className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const TILE_GRID: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };

function DetailBody({ d }: { d: Detail }) {
  const stageRows = d.stages.map((s, i) => ({
    key: s.key,
    label: s.label,
    value: s.count,
    display: String(s.count),
    sub: s.amount > 0 ? formatCompact(s.amount) : undefined,
    color: SERIES[i % SERIES.length],
  }));
  const noun = d.total.count === 1 ? "record" : "records";

  return (
    <>
      <div className={clsx("grid grid-cols-2 gap-3", TILE_GRID[d.tiles.length] ?? "lg:grid-cols-4")}>
        {d.tiles.map((t, i) => (
          <div key={t.label} className={clsx("card min-w-0 p-4", d.tiles.length % 2 === 1 && i === d.tiles.length - 1 && "col-span-2 lg:col-span-1")}>
            <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t.label}</p>
            <p className="mt-1.5 truncate text-2xl font-bold text-navy" title={t.kind === "amount" ? formatAmount(t.value) : undefined}>
              {tileValue(t)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title={d.stageTitle} note={`${d.total.count} ${noun}`} empty={d.total.count === 0} emptyText="No records match these filters.">
          <HBarChart ariaLabel={`${d.title}: ${d.stageTitle}`} rows={stageRows} />
        </ChartCard>
        <ChartCard title="Monthly trend" note="Records per month" empty={d.total.count === 0} emptyText="No records match these filters.">
          <ColumnChart
            months={d.trend.map((t) => t.month)}
            labels={d.trend.map((t) => t.label)}
            values={d.trend.map((t) => t.count)}
            tips={d.trend.map((t) => (t.amount > 0 ? formatAmount(t.amount) : ""))}
            ariaLabel={`${d.title}: records per month`}
          />
        </ChartCard>

        <ChartCard title="By loan type" note="Share of records" empty={d.total.count === 0} emptyText="No records match these filters.">
          <DonutChart
            slices={d.loanTypes.map((t) => ({ key: t.name, label: t.name, value: t.count }))}
            centreValue={String(d.total.count)}
            centreLabel={noun}
            ariaLabel={`${d.title} by loan type`}
          />
        </ChartCard>
        <section className="card min-w-0 overflow-hidden">
          <h2 className="px-5 pt-5 text-sm font-bold text-navy">Loan type breakdown</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-y border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-5 py-2.5 font-bold">Loan type</th>
                  <th className="px-3 py-2.5 text-right font-bold">Count</th>
                  <th className="px-3 py-2.5 text-right font-bold">{d.amountLabel}</th>
                  <th className="px-5 py-2.5 text-right font-bold">% of total</th>
                </tr>
              </thead>
              <tbody>
                {d.loanTypes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted">
                      No records match these filters.
                    </td>
                  </tr>
                ) : (
                  d.loanTypes.map((t) => (
                    <tr key={t.name} className="border-b border-line/70 last:border-0">
                      <td className="px-5 py-2.5 font-medium text-navy">{t.name}</td>
                      <td className="px-3 py-2.5 text-right">{t.count}</td>
                      <td className="px-3 py-2.5 text-right">{formatAmount(t.amount)}</td>
                      <td className="px-5 py-2.5 text-right text-muted">{t.percent}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card min-w-0 overflow-hidden">
        <h2 className="px-5 pt-5 text-sm font-bold text-navy">{d.stageTitle}: breakdown</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-y border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-5 py-2.5 font-bold">Stage</th>
                <th className="px-3 py-2.5 text-right font-bold">Count</th>
                <th className="px-5 py-2.5 text-right font-bold">{d.amountLabel}</th>
              </tr>
            </thead>
            <tbody>
              {d.stages.map((s) => (
                <tr key={s.key} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-2.5 font-medium text-navy">{s.label}</td>
                  <td className="px-3 py-2.5 text-right">{s.count}</td>
                  <td className="px-5 py-2.5 text-right">{formatAmount(s.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy/20 bg-gold-pale/40 font-bold text-navy">
                <td className="px-5 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right">{d.total.count}</td>
                <td className="px-5 py-2.5 text-right">{formatAmount(d.total.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}

type PreviewColumn = { key: string; label: string; type: "text" | "amount" | "date" | "percent" | "number" };
const SHOWN = 50;

const pretty = (v: string) => (/^[A-Z_]+$/.test(v) && !["RTGS", "NEFT", "IMPS", "UPI"].includes(v) ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ") : v);

function cell(type: PreviewColumn["type"], value: string | number | null) {
  if (value === null || value === "") return "—";
  if (type === "amount") return formatAmount(value);
  if (type === "date") return formatDate(String(value));
  if (type === "percent") return `${value}%`;
  return typeof value === "string" ? pretty(value) : String(value);
}

/** The records behind the numbers above, newest first (the first 50; Export has every one). */
function RecordsTable({ type, filters }: { type: ReportType; filters: Record<string, string | undefined> }) {
  const q = useQuery({
    queryKey: ["report-preview", type, filters],
    queryFn: () => api<{ columns: PreviewColumn[]; rows: Record<string, string | number | null>[]; truncated: boolean }>(`/reports/records${qs({ type, ...filters })}`),
  });
  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 className="text-sm font-bold text-navy">Records</h2>
        {q.data && (
          <p className="text-[12px] text-muted">
            {q.data.rows.length > SHOWN || q.data.truncated ? `Showing the first ${SHOWN} — Export has every record` : `${q.data.rows.length} ${q.data.rows.length === 1 ? "record" : "records"}`}
          </p>
        )}
      </div>
      <div className="mt-3 overflow-x-auto">
        {q.isPending ? (
          <TableSkeleton rows={4} cols={5} />
        ) : q.isError ? (
          <p className="px-5 py-8 text-center text-sm text-red-600">{(q.error as Error).message}</p>
        ) : q.data.rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">No records match these filters.</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="border-y border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                {q.data.columns.map((c) => (
                  <th key={c.key} className={clsx("px-4 py-2.5 font-bold", c.type === "amount" && "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data.rows.slice(0, SHOWN).map((r, i) => (
                <tr key={i} className="border-b border-line/70 last:border-0">
                  {q.data.columns.map((c) => (
                    <td key={c.key} className={clsx("px-4 py-2.5", c.type === "amount" && "text-right")}>
                      {cell(c.type, r[c.key] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
