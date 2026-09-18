import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { api, qs, tokenStore } from "../lib/api";
import { formatAmount, formatDate } from "../lib/format";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/app-shell";

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
  officer: "Officer",
  role: "Role",
};

const AMOUNT_KEYS = new Set(["requestedAmount", "disbursedAmount", "sanctionedAmount"]);

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

  const range = {
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
  };
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

  // The export streams a file, so it needs a direct fetch rather than the JSON helper.
  const exportCsv = async () => {
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

  const visibleTables = TABLES.filter((t) => !t.managersOnly || user?.role !== "ADVISOR");
  const columns = rows.data?.length ? Object.keys(rows.data[0]) : [];

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={
          user?.role === "ADVISOR" ? "Your own pipeline" : "Firm-wide pipeline and performance"
        }
        actions={
          <button onClick={exportCsv} className="btn-ghost">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      <div className="px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="field w-40"
            title="From"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="field w-40"
            title="To"
          />
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

        <div className="mt-6 mb-3 flex flex-wrap gap-1">
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
                  {columns.map((c) => (
                    <th key={c} className="px-4 py-2.5 font-bold">
                      {HEADING[c] ?? c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.data.map((row, i) => (
                  <tr key={i} className="border-b border-line/70 last:border-0">
                    {columns.map((c) => (
                      <td key={c} className="px-4 py-3">
                        {AMOUNT_KEYS.has(c)
                          ? formatAmount(row[c])
                          : c === "conversionRate"
                            ? `${row[c]}%`
                            : (row[c] ?? "—")}
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
        <div className="card overflow-hidden">
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
                    <td className="px-4 py-3 text-muted">{s.status}</td>
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
    </>
  );
}
