import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Columns, Download, FileSpreadsheet, Loader2, Printer, Search } from "lucide-react";
import { api, qs } from "../lib/api";
import { downloadReport } from "../lib/download-report";
import { formatAmount, formatDate } from "../lib/format";
import { PeriodSelect } from "./period-select";
import { DatePicker } from "./date-picker";

type ReportType = "leads" | "applications" | "sanctions" | "disbursements" | "commissions";

type ColumnType = "text" | "amount" | "date" | "percent" | "number";

type ReportMeta = {
  title: string;
  generatedAt: string;
  generatedBy: string;
  company: { name: string; legalName: string; address: string; phone: string; email: string; gstin: string; pan: string };
  filters: { label: string; value: string }[];
  summary: { label: string; value: number; kind: "count" | "amount" }[];
  truncated: boolean;
};

type RecordResult = {
  type: ReportType;
  columns: { key: string; label: string; type: ColumnType }[];
  rows: Record<string, string | number | null>[];
  truncated: boolean;
  meta: ReportMeta;
};

const TYPES: { value: ReportType; label: string; statuses: { value: string; label: string }[] }[] = [
  {
    value: "leads",
    label: "Leads",
    statuses: ["NEW", "CONTACTED", "QUALIFIED", "DOCS_PENDING", "CONVERTED", "LOST"].map((v) => ({
      value: v,
      label: v.replace("_", " ").toLowerCase(),
    })),
  },
  {
    value: "applications",
    label: "Applications",
    statuses: ["DRAFT", "SUBMITTED", "BANK_LOGIN", "UNDER_REVIEW", "SANCTIONED", "DISBURSED", "REJECTED", "WITHDRAWN"].map(
      (v) => ({ value: v, label: v.replace("_", " ").toLowerCase() }),
    ),
  },
  {
    value: "sanctions",
    label: "Sanctions",
    statuses: ["PENDING", "APPROVED", "REJECTED"].map((v) => ({ value: v, label: `financial ${v.toLowerCase()}` })),
  },
  {
    value: "disbursements",
    label: "Disbursements",
    statuses: [
      { value: "FULL", label: "full" },
      { value: "PART", label: "part" },
    ],
  },
  {
    value: "commissions",
    label: "Commissions",
    statuses: ["PENDING", "PARTIAL", "PAID"].map((v) => ({ value: v, label: v.toLowerCase() })),
  },
];

const pretty = (v: string) => (/^[A-Z_]+$/.test(v) ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ") : v);

const cell = (type: ColumnType, value: string | number | null) => {
  if (value === null || value === "") return "—";
  switch (type) {
    case "amount":
      return formatAmount(value);
    case "date":
      return formatDate(String(value));
    case "percent":
      return `${value}%`;
    default:
      return typeof value === "string" ? pretty(value) : String(value);
  }
};

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

export function RecordReport() {
  const [type, setType] = useState<ReportType>("leads");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [loanProductId, setLoanProductId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState<Record<string, Set<string>>>({});
  const [colMenu, setColMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Debounce the free-text search so each keystroke doesn't hit the API.
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!colMenu) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setColMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [colMenu]);

  const products = useQuery({
    queryKey: ["loan-products"],
    queryFn: () => api<{ id: string; name: string }[]>("/loan-products"),
  });

  // A named period and a custom range are mutually exclusive; the server resolves either.
  const dateFilters = period === "custom" ? { from, to } : { range: period };
  const filters = { type, ...dateFilters, status, loanProductId, q };
  const result = useQuery({
    queryKey: ["report-records", filters],
    queryFn: () => api<RecordResult>(`/reports/records${qs(filters)}`),
    placeholderData: (prev) => prev,
  });

  const meta = TYPES.find((t) => t.value === type)!;
  const hiddenNow = hidden[type] ?? new Set<string>();
  const columns = (result.data?.type === type ? result.data.columns : []).filter((c) => !hiddenNow.has(c.key));

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev[type] ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [type]: next };
    });

  const download = (format: "xlsx" | "csv") =>
    void downloadReport(type, { ...filters, columns: columns.map((c) => c.key).join(",") }, format);

  const amountTotals = new Map<string, number>();
  for (const c of columns.filter((c) => c.type === "amount")) {
    amountTotals.set(
      c.key,
      (result.data?.rows ?? []).reduce((sum, r) => sum + (typeof r[c.key] === "number" ? (r[c.key] as number) : 0), 0),
    );
  }

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
          Report
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as ReportType);
              setStatus("");
            }}
            className="field mt-1 w-40 normal-case"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
          Period
          <div className="mt-1">
            <PeriodSelect value={period} onChange={setPeriod} allowCustom className="field w-64 normal-case" />
          </div>
        </label>
        {period === "custom" && (
          <>
            <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
              From
              <DatePicker value={from} onChange={setFrom} max={to || undefined} className="mt-1 w-44" placeholder="From date" />
            </label>
            <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
              To
              <DatePicker value={to} onChange={setTo} min={from || undefined} className="mt-1 w-44" placeholder="To date" />
            </label>
          </>
        )}
        <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field mt-1 w-40 normal-case">
            <option value="">All statuses</option>
            {meta.statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
          Loan type
          <select
            value={loanProductId}
            onChange={(e) => setLoanProductId(e.target.value)}
            className="field mt-1 w-44 normal-case"
          >
            <option value="">All loan types</option>
            {products.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, mobile, reference…"
            className="field w-full pl-8"
          />
        </div>

        <div ref={menuRef} className="relative">
          <button onClick={() => setColMenu((o) => !o)} className="btn-ghost">
            <Columns className="h-4 w-4" /> Columns
          </button>
          {colMenu && (
            <div className="card absolute right-0 z-30 mt-1 max-h-72 w-52 overflow-y-auto p-2 shadow-lg">
              {(result.data?.columns ?? []).map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-bg-light">
                  <input type="checkbox" checked={!hiddenNow.has(c.key)} onChange={() => toggle(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => download("xlsx")} className="btn-primary">
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </button>
        <button onClick={() => download("csv")} className="btn-ghost">
          <Download className="h-4 w-4" /> CSV
        </button>
        <button onClick={() => window.print()} className="btn-ghost">
          <Printer className="h-4 w-4" /> Print / PDF
        </button>
      </div>

      {result.data?.meta && <ReportHeader meta={result.data.meta} />}

      <div className="card overflow-x-auto">
        {result.isPending ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : result.isError ? (
          <p className="py-10 text-center text-sm text-red-600">{(result.error as Error).message}</p>
        ) : result.data.rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">No records match these filters.</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-2.5 font-bold whitespace-nowrap ${c.type === "amount" ? "text-right" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.rows.map((row, i) => (
                <tr key={i} className="border-b border-line/70 even:bg-bg-light/50 last:border-0">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-2.5 whitespace-nowrap text-ink ${c.type === "amount" ? "text-right font-medium" : ""}`}
                    >
                      {cell(c.type, row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {amountTotals.size > 0 && (
              <tfoot>
                <tr className="border-t-2 border-navy/30 bg-gold-pale/60 font-bold text-navy">
                  {columns.map((c, i) => (
                    <td key={c.key} className={`px-4 py-2.5 whitespace-nowrap ${c.type === "amount" ? "text-right" : ""}`}>
                      {i === 0 ? "TOTAL" : c.type === "amount" ? formatAmount(amountTotals.get(c.key)) : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
      {result.data && (
        <p className="mt-2 text-[12px] text-muted">
          {result.data.rows.length} record{result.data.rows.length === 1 ? "" : "s"}
          {result.data.truncated && " (showing the first 1,000 — narrow the filters to see the rest)"}
        </p>
      )}
    </div>
  );
}

function ReportHeader({ meta }: { meta: ReportMeta }) {
  const { company } = meta;
  const legal = [company.legalName !== company.name ? company.legalName : "", company.address].filter(Boolean).join(" · ");
  const contact = [
    company.phone && `Tel ${company.phone}`,
    company.email,
    company.gstin && `GSTIN ${company.gstin}`,
    company.pan && `PAN ${company.pan}`,
  ]
    .filter(Boolean)
    .join("  |  ");

  return (
    <section className="card mb-4 overflow-hidden">
      <div className="bg-navy px-5 py-4 text-white">
        <p className="text-lg font-bold">{company.name}</p>
        {legal && <p className="mt-0.5 text-[12px] text-white/75">{legal}</p>}
        {contact && <p className="text-[12px] text-white/75">{contact}</p>}
      </div>
      <div className="h-1 bg-gold" />

      <div className="px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-navy">{meta.title}</h2>
          <p className="text-[12px] text-muted">
            Generated {stamp(meta.generatedAt)} IST · by {meta.generatedBy}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {meta.filters.map((f) => (
            <span key={f.label} className="rounded-full bg-bg-light px-2.5 py-1 text-[12px] text-muted ring-1 ring-line">
              {f.label}: <span className="font-semibold text-navy">{f.value}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {meta.summary.map((s) => (
            <div key={s.label} className="rounded-lg border border-line px-3 py-2.5">
              <p className="truncate text-[11px] font-bold tracking-wide text-muted uppercase" title={s.label}>
                {s.label}
              </p>
              <p className="mt-0.5 text-lg font-bold text-navy">
                {s.kind === "amount" ? formatAmount(s.value) : s.value.toLocaleString("en-IN")}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
