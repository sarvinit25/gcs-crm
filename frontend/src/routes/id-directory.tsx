import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Eye, EyeOff, Search } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatDate } from "../lib/format";
import type { ApplicationStatus, LeadStatus, Paginated } from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { ApplicationStatusBadge, LeadStatusBadge } from "../components/status-badge";
import { TableSkeleton } from "../components/skeleton";

type Kind = "applications" | "leads" | "partners";

type Row = {
  kind: "lead" | "application" | "partner";
  id: string;
  gcsId: string;
  name: string;
  phone: string | null;
  status: string;
  owner: string | null;
  partner: string | null;
  accessCode: string | null;
  createdAt: string;
};

const TABS: { kind: Kind; label: string; hint: string; countKey: "applications" | "leads" | "partners" }[] = [
  { kind: "applications", label: "Clients", hint: "Application numbers and the codes clients track with", countKey: "applications" },
  { kind: "leads", label: "Leads", hint: "Every enquiry, by lead number", countKey: "leads" },
  { kind: "partners", label: "Partners", hint: "Sourcing partner codes", countKey: "partners" },
];

/** A small button that copies a value and says so for a moment. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        });
      }}
      className="rounded p-1 text-muted transition-colors hover:bg-bg-light hover:text-navy"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** A client's code is a sign-in secret, so it stays hidden until someone asks to see it. */
function AccessCode({ code }: { code: string | null }) {
  const [shown, setShown] = useState(false);
  if (!code) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <code className="rounded bg-bg-light px-1.5 py-0.5 font-mono text-[12px] tracking-widest text-navy">
        {shown ? code : "••••••••"}
      </code>
      <button
        type="button"
        title={shown ? "Hide the code" : "Show the code"}
        aria-label={shown ? "Hide the code" : "Show the code"}
        onClick={() => setShown((s) => !s)}
        className="rounded p-1 text-muted transition-colors hover:bg-bg-light hover:text-navy"
      >
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <CopyButton value={code} label="access code" />
    </span>
  );
}

function StatusCell({ row }: { row: Row }) {
  if (row.kind === "lead") return <LeadStatusBadge status={row.status as LeadStatus} />;
  if (row.kind === "application") return <ApplicationStatusBadge status={row.status as ApplicationStatus} />;
  return (
    <span
      className={clsx(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
        row.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600",
      )}
    >
      {row.status}
    </span>
  );
}

function OpenLink({ row }: { row: Row }) {
  const cls = "text-[13px] font-semibold text-navy hover:text-gold-dark";
  if (row.kind === "lead")
    return (
      <Link to="/leads/$leadId" params={{ leadId: row.id }} className={cls}>
        Open
      </Link>
    );
  if (row.kind === "application")
    return (
      <Link to="/applications/$applicationId" params={{ applicationId: row.id }} className={cls}>
        Open
      </Link>
    );
  return (
    <Link to="/partners" className={cls}>
      Open
    </Link>
  );
}

/** Every GCS reference in one place: client file numbers and codes, lead numbers and partner codes. */
export function IdDirectoryPage() {
  const [kind, setKind] = useState<Kind>("applications");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const counts = useQuery({
    queryKey: ["id-directory", "summary"],
    queryFn: () => api<Record<Kind, number>>("/id-directory/summary"),
  });

  const query = useQuery({
    queryKey: ["id-directory", { kind, search, page }],
    queryFn: () => api<Paginated<Row>>(`/id-directory${qs({ type: kind, search, page })}`),
    placeholderData: (previous) => previous,
  });

  const pick = (next: Kind) => {
    setKind(next);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="GCS IDs"
        subtitle="Every client file, lead and partner reference in one place. Visible to the main admin only."
      />

      <div className="px-6 py-5">
        <div className="mb-4 grid gap-2.5 sm:grid-cols-3">
          {TABS.map((t) => (
            <button
              key={t.kind}
              onClick={() => pick(t.kind)}
              className={clsx(
                "rounded-xl border bg-white px-4 py-3 text-left transition-colors",
                kind === t.kind ? "border-navy ring-2 ring-navy/20" : "border-line hover:border-navy/30",
              )}
            >
              <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{t.label}</p>
              <p className="mt-0.5 text-xl font-bold text-navy">
                {counts.data ? counts.data[t.countKey].toLocaleString("en-IN") : "—"}
              </p>
              <p className="text-[11px] leading-snug text-muted">{t.hint}</p>
            </button>
          ))}
        </div>

        <div className="mb-4">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={
                kind === "applications"
                  ? "GCS number, access code, name or phone"
                  : kind === "leads"
                    ? "Lead number, name or phone"
                    : "Partner code, name, firm or phone"
              }
              className="field w-full pl-9"
            />
          </div>
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">{(query.error as Error).message}</p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">Nothing matches that search.</p>
          ) : (
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">GCS ID</th>
                  <th className="px-4 py-2.5 font-bold">{kind === "partners" ? "Partner" : kind === "leads" ? "Lead" : "Client"}</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">{kind === "partners" ? "Manager" : "Owner"}</th>
                  {kind !== "partners" && <th className="px-4 py-2.5 font-bold">Partner</th>}
                  {kind === "applications" && <th className="px-4 py-2.5 font-bold">Tracking code</th>}
                  <th className="px-4 py-2.5 font-bold">Created</th>
                  <th className="px-4 py-2.5 font-bold" />
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((row) => (
                  <tr key={row.id} className="border-b border-line/70 last:border-0 hover:bg-bg-light/70">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-[13px] font-semibold text-navy">{row.gcsId}</span>
                        {row.gcsId !== "Not set" && <CopyButton value={row.gcsId} label="GCS ID" />}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">{row.name}</p>
                      {row.phone && <p className="text-[12px] text-muted">{row.phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusCell row={row} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {row.owner ?? <span className="text-amber-600">Unassigned</span>}
                    </td>
                    {kind !== "partners" && <td className="px-4 py-3 text-muted">{row.partner ?? "—"}</td>}
                    {kind === "applications" && (
                      <td className="px-4 py-3">
                        <AccessCode code={row.accessCode} />
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <OpenLink row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {query.data && query.data.total > query.data.pageSize && (
          <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
            <span>
              Page {query.data.page} of {Math.ceil(query.data.total / query.data.pageSize)} ·{" "}
              {query.data.total.toLocaleString("en-IN")} in all
            </span>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                className="btn-ghost"
                disabled={page >= Math.ceil(query.data.total / query.data.pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
