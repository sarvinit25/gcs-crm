import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, Store } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import type { Paged } from "../lib/lender-contacts";
import { TableSkeleton } from "./skeleton";

type Branch = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  region: string | null;
  zone: string | null;
  area: string | null;
  dsaSourcing: string | null;
  details: Record<string, string> | null;
};

const PAGE = 20;

function Sourcing({ value }: { value: string }) {
  const ok = /^allowed/i.test(value);
  return <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>{value}</span>;
}

/** A lender's branches where its list gives them — searchable, and showing where DSA-sourced files are or aren't taken. */
export function LenderBranches({ lenderId, count }: { lenderId: string; count: number }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const query = useQuery({
    queryKey: ["lender-branches", lenderId, q, page],
    queryFn: () => api<Paged<Branch>>(`/lenders/${lenderId}/branches?limit=${PAGE}&page=${page}${q ? `&search=${encodeURIComponent(q)}` : ""}`),
    placeholderData: (prev) => prev,
  });
  if (!count) return null;
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const showSourcing = (query.data?.items ?? []).some((b) => b.dsaSourcing);
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-navy">
          <Store className="h-4 w-4 text-muted" /> Branches <span className="font-normal text-muted">({count.toLocaleString("en-IN")})</span>
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Branch, town, state or zone" className="field w-64 pl-9" />
        </div>
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : !query.data?.items.length ? (
        <p className="py-6 text-center text-[13px] text-muted">No branch matches that.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="py-2 pr-4 font-bold">Branch</th>
                <th className="py-2 pr-4 font-bold">State</th>
                <th className="py-2 pr-4 font-bold">Region / zone</th>
                {showSourcing && <th className="py-2 pr-4 font-bold">DSA files</th>}
                <th className="py-2 font-bold">Details</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((b) => (
                <tr key={b.id} className="border-b border-line/70 align-top last:border-0">
                  <td className="whitespace-normal py-2.5 pr-4 font-semibold text-navy">{b.name}{b.area && <span className="block text-[12px] font-normal text-muted">{b.area}</span>}</td>
                  <td className="whitespace-normal py-2.5 pr-4 text-muted">{b.state ?? "—"}</td>
                  <td className="whitespace-normal py-2.5 pr-4 text-muted">{[b.zone, b.region].filter(Boolean).join(" › ") || "—"}</td>
                  {showSourcing && <td className="whitespace-normal py-2.5 pr-4">{b.dsaSourcing ? <Sourcing value={b.dsaSourcing} /> : <span className="text-muted">—</span>}</td>}
                  <td className="whitespace-normal py-2.5 text-[12px] text-muted">
                    {Object.entries(b.details ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
          <span>{total.toLocaleString("en-IN")} branches</span>
          <span className="flex items-center gap-2">
            <button className="btn-ghost !px-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            Page {page} of {pages}
            <button className="btn-ghost !px-2 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </span>
        </div>
      )}
    </section>
  );
}
