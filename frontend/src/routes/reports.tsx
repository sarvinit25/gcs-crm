import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Columns, Download, Loader2 } from "lucide-react";
import { api, qs, tokenStore } from "../lib/api";
import { formatAmount, formatDate, humanize } from "../lib/format";
import { ROLE_LABEL, type Role } from "../lib/types";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/app-shell";
import { RecordReport } from "../components/record-report";
import { DatePicker } from "../components/date-picker";

type Funnel = {
  leads: number;
  converted: number;
  conversionRate: number;
  applications: number;
  requestedAmount: string;
  sanctions: number;
  sanctionedAmount: string;
  disbursements: number;
  disbursedAmount: string;
};

type Row = Record<string, string | number | null>;

type Stalled = {
  id: string;
  applicationNo: string;
  applicant: string | null;
  status: string;
  lender: string | null;
  owner: string | null;
  requestedAmount: string;
  lastTouched: string;
};

const TABLES: { key: string; label: string; managersOnly?: boolean }[] = [
  { key: "by-source", label: "Lead sources" },
  { key: "by-product", label: "Loan mix" },
  { key: "by-lender", label: "Lenders" },
  { key: "by-officer", label: "Officers", managersOnly: true },
];

const HEADING: Record<string, string> = {
  source: "Source",
  leads: "Leads",
  converted: "Converted",
  conversionRate: "Conv. %",
  product: "Product",
  category: "Category",
  applications: "Applications",
  requestedAmount: "Requested",
  disbursedAmount: "Disbursed",
  lender: "Lender",
  type: "Type",
  sanctions: "Sanctions",
  sanctionedAmount: "Sanctioned",
  rejected: "Rejected",
  approvalRate: "Approval %",
  avgDaysToSanction: "Days to sanction",
  avgRate: "Avg. rate",
  avgSanction: "Avg. sanction",
  officer: "Officer",
  role: "Role",
};

const AMOUNT_KEYS = new Set(["requestedAmount", "disbursedAmount", "sanctionedAmount", "avgSanction"]);

function cellText(row: Row, col: string): string {
  const v = row[col];
  if (AMOUNT_KEYS.has(col)) return formatAmount(v);
  if (col === "conversionRate" || col === "approvalRate") return v == null ? "—" : `${v}%`;
  if (col === "avgRate") return v == null ? "—" : `${v}%`;
  if (col === "avgDaysToSanction") return v == null ? "—" : `${v} d`;
  if (col === "role" && typeof v === "string") return ROLE_LABEL[v as Role];
  if (col === "source" && typeof v === "string") return humanize(v);
  return v == null ? "—" : String(v);
}

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(filename: string, header: string[], data: string[][]) {
  const csv = [header, ...data].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1.5 text-xl font-bold text-navy">{value}</p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

export function ReportsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [table, setTable] = useState<string>("by-source");
  const [hiddenCols, setHiddenCols] = useState<Record<string, Set<string>>>({});
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [view, setView] = useState<"summary" | "records">("summary");

  // Plain YYYY-MM-DD: the server treats these as India calendar days, end day included.
  const range = { from: from || undefined, to: to || undefined };
  const suffix = qs(range);

  const funnel = useQuery({
    queryKey: ["report-funnel", range],
    queryFn: () => api<Funnel>(`/reports/funnel${suffix}`),
  });

  const rows = useQuery({
    queryKey: ["report-table", table, range],
    queryFn: () => api<Row[]>(`/reports/${table}${suffix}`),
  });

  const stalled = useQuery({
    queryKey: ["report-stalled"],
    queryFn: () => api<Stalled[]>("/reports/stalled"),
  });

  // Selecting a different report (or narrowing the date range) invalidates any
  // row selection made against the previous result set.
  useEffect(() => {
    setSelected(new Set());
  }, [table, from, to]);

  useEffect(() => {
    if (!colMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [colMenuOpen]);

  const visibleTables = TABLES.filter((t) => !t.managersOnly || user?.role !== "ADVISOR");
  const columns = rows.data?.length ? Object.keys(rows.data[0]) : [];
  const hidden = hiddenCols[table] ?? new Set<string>();
  const visibleColumns = columns.filter((c) => !hidden.has(c));

  function toggleColumn(col: string) {
    setHiddenCols((prev) => {
      const next = new Set(prev[table] ?? []);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return { ...prev, [table]: next };
    });
  }

  function toggleRow(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const allSelected = !!rows.data?.length && selected.size === rows.data.length;
  function toggleAll() {
    if (!rows.data) return;
    setSelected(allSelected ? new Set() : new Set(rows.data.map((_, i) => i)));
  }

  // With rows selected, export just those (client-side, as currently displayed);
  // otherwise stream the full report from the server as before.
  const exportCsv = async () => {
    if (selected.size > 0 && rows.data) {
      const header = visibleColumns.map((c) => HEADING[c] ?? c);
      const data = rows.data
        .filter((_, i) => selected.has(i))
        .map((row) => visibleColumns.map((c) => cellText(row, c)));
      downloadCsv(`gcs-${table}-selected.csv`, header, data);
      return;
    }
    const res = await fetch(`/crm/api/reports/export${qs({ report: table, ...range })}`, {
      headers: { Authorization: `Bearer ${tokenStore.get()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gcs-${table}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={
          user?.role === "ADVISOR" ? "Your own pipeline" : "Firm-wide pipeline and performance"
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-md border border-line bg-white p-1">
              {(["summary", "records"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded px-3 py-1.5 text-[13px] font-semibold capitalize transition ${
                    view === v ? "bg-navy text-white" : "text-muted hover:text-navy"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            {view === "summary" && (
              <button onClick={exportCsv} className="btn-ghost">
                <Download className="h-4 w-4" />
                {selected.size > 0 ? `Export selected (${selected.size})` : "Export CSV"}
              </button>
            )}
          </div>
        }
      />

      {view === "records" ? (
        <div className="px-6 py-5">
          <RecordReport />
        </div>
      ) : (
      <div className="px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <DatePicker value={from} onChange={setFrom} max={to || undefined} className="w-44" title="From" placeholder="From date" />
          <DatePicker value={to} onChange={setTo} min={from || undefined} className="w-44" title="To" placeholder="To date" />
          {(from || to) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="btn-ghost"
            >
              Clear
            </button>
          )}
        </div>

        {funnel.isPending ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : funnel.isError ? (
          <p className="py-10 text-sm text-red-600">{(funnel.error as Error).message}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Leads"
              value={String(funnel.data.leads)}
              sub={`${funnel.data.converted} converted · ${funnel.data.conversionRate}%`}
            />
            <Stat
              label="Applications"
              value={String(funnel.data.applications)}
              sub={`${formatAmount(funnel.data.requestedAmount)} requested`}
            />
            <Stat
              label="Sanctions"
              value={String(funnel.data.sanctions)}
              sub={`${formatAmount(funnel.data.sanctionedAmount)} sanctioned`}
            />
            <Stat
              label="Disbursed"
              value={formatAmount(funnel.data.disbursedAmount)}
              sub={`${funnel.data.disbursements} payouts`}
            />
          </div>
        )}

        <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {visibleTables.map((t) => (
              <button
                key={t.key}
                onClick={() => setTable(t.key)}
                className={
                  table === t.key
                    ? "rounded-md bg-navy px-3 py-1.5 text-[13px] font-semibold text-white"
                    : "rounded-md border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-navy"
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative" ref={colMenuRef}>
            <button onClick={() => setColMenuOpen((o) => !o)} className="btn-ghost" disabled={!columns.length}>
              <Columns className="h-4 w-4" /> Columns
            </button>
            {colMenuOpen && (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-line bg-white p-2 shadow-lg">
                <p className="px-2 py-1 text-[11px] font-bold tracking-wide text-muted uppercase">
                  Show columns
                </p>
                {columns.map((c) => (
                  <label
                    key={c}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-ink hover:bg-bg-light"
                  >
                    <input
                      type="checkbox"
                      checked={!hidden.has(c)}
                      onChange={() => toggleColumn(c)}
                      className="h-3.5 w-3.5 rounded border-line accent-navy"
                    />
                    {HEADING[c] ?? c}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-gold/10 px-4 py-2 text-[13px] font-semibold text-navy">
            {selected.size} row{selected.size === 1 ? "" : "s"} selected
            <button onClick={() => setSelected(new Set())} className="text-muted hover:text-navy">
              Clear
            </button>
          </div>
        )}

        <div className="card overflow-x-auto">
          {rows.isPending ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.isError ? (
            <p className="py-12 text-center text-sm text-red-600">
              {(rows.error as Error).message}
            </p>
          ) : !rows.data.length ? (
            <p className="py-12 text-center text-sm text-muted">No data in this range.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-line accent-navy"
                    />
                  </th>
                  {visibleColumns.map((c) => (
                    <th key={c} className="px-4 py-2.5 font-bold">
                      {HEADING[c] ?? c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.data.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      selected.has(i)
                        ? "border-b border-line/70 bg-gold/5 last:border-0"
                        : "border-b border-line/70 last:border-0"
                    }
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggleRow(i)}
                        className="h-3.5 w-3.5 rounded border-line accent-navy"
                      />
                    </td>
                    {visibleColumns.map((c) => (
                      <td key={c} className="px-4 py-3">
                        {cellText(row, c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <h2 className="mt-8 mb-3 text-sm font-bold text-navy">
          Stalled cases
          <span className="ml-2 font-normal text-muted">
            in progress, untouched for 30 days
          </span>
        </h2>
        <div className="card overflow-x-auto">
          {stalled.isPending ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !stalled.data?.length ? (
            <p className="py-12 text-center text-sm text-muted">
              Nothing stalled — every live case has been touched in the last 30 days.
            </p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Application</th>
                  <th className="px-4 py-2.5 font-bold">Applicant</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Lender</th>
                  <th className="px-4 py-2.5 font-bold">Owner</th>
                  <th className="px-4 py-2.5 font-bold">Last touched</th>
                </tr>
              </thead>
              <tbody>
                {stalled.data.map((s) => (
                  <tr key={s.id} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-3 font-semibold text-navy">{s.applicationNo}</td>
                    <td className="px-4 py-3">{s.applicant ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{humanize(s.status)}</td>
                    <td className="px-4 py-3 text-muted">{s.lender ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{s.owner ?? "—"}</td>
                    <td className="px-4 py-3 text-red-600">{formatDate(s.lastTouched)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}
    </>
  );
}
