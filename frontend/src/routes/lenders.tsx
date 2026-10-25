import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Layers, Plus, RotateCcw, Search } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { LenderRow } from "../lib/lenders";
import { percent } from "../lib/lenders";
import { PageHeader } from "../components/app-shell";
import { TableSkeleton } from "../components/skeleton";
import { PeopleDirectory } from "../components/lender-contacts";
import { LenderAvatar } from "../components/lender-avatar";
import { BulkPolicyModal } from "../components/bulk-policy-modal";

type StatusFilter = "all" | "active" | "inactive";

function StatCard({
  value,
  label,
  tone,
  selected,
  onClick,
}: {
  value: number | string;
  label: string;
  tone: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className={clsx("text-2xl font-bold", tone)}>{value}</p>
      <p className="mt-0.5 text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
    </>
  );
  const box = clsx("card p-4 text-left", selected && "border-navy/50 ring-2 ring-navy/10");
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={selected} className={clsx(box, "transition hover:border-navy/30")}>
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

export function LendersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const canBulk = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [view, setView] = useState<"lenders" | "people">("lenders");
  const [bulk, setBulk] = useState(false);

  const query = useQuery({
    queryKey: ["lenders-directory"],
    queryFn: () => api<LenderRow[]>("/lenders?includeInactive=true"),
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/lenders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lenders-directory"] });
      void queryClient.invalidateQueries({ queryKey: ["lenders"] });
    },
  });

  const all = query.data ?? [];
  const needle = search.trim().toLowerCase();
  const visible = all.filter(
    (l) =>
      (!typeFilter || l.type === typeFilter) &&
      (status === "all" || (status === "active") === l.active) &&
      (!needle ||
        l.name.toLowerCase().includes(needle) ||
        l.shortName?.toLowerCase().includes(needle) ||
        l.relationshipManager?.name.toLowerCase().includes(needle) ||
        l.brokerCode?.toLowerCase().includes(needle)),
  );
  const filtered = Boolean(needle || typeFilter || status !== "all");
  const reset = () => {
    setSearch("");
    setTypeFilter("");
    setStatus("all");
  };
  const publicCount = all.filter((l) => l.isPublic && l.active).length;

  return (
    <>
      <PageHeader
        title="Lenders"
        subtitle={query.data ? `Partner banks and NBFCs · ${publicCount} shown on the website` : "Partner banks and NBFCs"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canBulk && view === "lenders" && (
              <button onClick={() => setBulk(true)} className="btn-ghost">
                <Layers className="h-4 w-4" /> Bulk add loan type
              </button>
            )}
            {isAdmin && view === "lenders" && (
              <Link to="/lenders/new" className="btn-primary">
                <Plus className="h-4 w-4" /> Add lender
              </Link>
            )}
          </div>
        }
      />

      <div className="px-6 py-5">
        <div className="mb-4 inline-flex rounded-lg border border-line bg-white p-0.5" role="tablist" aria-label="Directory view">
          {([["lenders", "Banks & NBFCs"], ["people", "People"]] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={clsx("rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition", view === key ? "bg-navy text-white" : "text-muted hover:text-navy")}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "people" && <PeopleDirectory lenders={all.filter((l) => l.active)} />}

        {view === "lenders" && (
          <>
            {update.isError && (
              <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(update.error as Error).message}</p>
            )}

            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard value={all.length} label="All lenders" tone="text-navy" selected={status === "all"} onClick={() => setStatus("all")} />
              <StatCard value={all.filter((l) => l.active).length} label="Active" tone="text-emerald-700" selected={status === "active"} onClick={() => setStatus("active")} />
              <StatCard value={all.filter((l) => !l.active).length} label="Inactive" tone="text-red-600" selected={status === "inactive"} onClick={() => setStatus("inactive")} />
              <StatCard value={all.reduce((n, l) => n + l.policyCount, 0)} label="Loan types offered" tone="text-sky-700" />
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, short name or manager"
                  className="field w-72 pl-9"
                />
              </div>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="field w-36" aria-label="Type">
                <option value="">All types</option>
                <option value="BANK">Banks</option>
                <option value="NBFC">NBFCs</option>
              </select>
              {filtered && (
                <button onClick={reset} className="btn-ghost">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
            </div>

            <div className="card overflow-x-auto">
              {query.isPending ? (
                <TableSkeleton />
              ) : !visible.length ? (
                <p className="py-16 text-center text-sm text-muted">{filtered ? "No lender matches." : "No lenders yet."}</p>
              ) : (
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                    <tr>
                      <th className="px-4 py-2.5 font-bold">Lender</th>
                      <th className="px-4 py-2.5 font-bold">Type</th>
                      <th className="px-4 py-2.5 font-bold">Relationship manager</th>
                      <th className="px-4 py-2.5 font-bold">Loan types</th>
                      <th className="px-4 py-2.5 font-bold">Our commission</th>
                      <th className="px-4 py-2.5 font-bold">Files</th>
                      <th className="px-4 py-2.5 font-bold">On website</th>
                      <th className="px-4 py-2.5 font-bold">Status</th>
                      <th className="px-4 py-2.5 font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((l) => (
                      <tr id={`lender-${l.id}`} key={l.id} className="border-b border-line/70 last:border-0">
                        <td className="px-4 py-3">
                          <Link to="/lenders/$lenderId" params={{ lenderId: l.id }} className="flex items-center gap-2.5">
                            <LenderAvatar name={l.name} type={l.type} />
                            <span className={clsx(!l.active && "opacity-50")}>
                              <span className="block font-semibold text-navy hover:underline">{l.name}</span>
                              {l.shortName && <span className="block text-[12px] text-muted">{l.shortName}</span>}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", l.type === "BANK" ? "bg-navy/8 text-navy" : "bg-gold-pale text-gold-dark")}>
                            {l.type === "BANK" ? "Bank" : "NBFC"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {l.relationshipManager ? (
                            <>
                              <p className="font-semibold text-navy">{l.relationshipManager.name}</p>
                              <p className="text-[12px] text-muted">{l.relationshipManager.email ?? l.relationshipManager.phone ?? ""}</p>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted" title={`${l.activePolicyCount} active of ${l.policyCount}`}>
                          {l.policyCount}
                        </td>
                        <td className="px-4 py-3 text-muted">{percent(l.defaultCommission)}</td>
                        <td className="px-4 py-3 text-muted">{l.applicationCount}</td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <button
                              onClick={() => update.mutate({ id: l.id, isPublic: !l.isPublic })}
                              className={clsx("inline-flex items-center gap-1.5 text-[12px] font-semibold", l.isPublic ? "text-emerald-700" : "text-muted")}
                            >
                              {l.isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              {l.isPublic ? "Visible" : "Hidden"}
                            </button>
                          ) : (
                            <span className="text-[12px] text-muted">{l.isPublic ? "Visible" : "Hidden"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin ? (
                            <button
                              onClick={() => update.mutate({ id: l.id, active: !l.active })}
                              title={l.active ? "Click to switch off" : "Click to switch on"}
                              className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-bold", l.active ? "bg-green-50 text-green-700" : "bg-bg-light text-muted")}
                            >
                              {l.active ? "Active" : "Inactive"}
                            </button>
                          ) : (
                            <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-bold", l.active ? "bg-green-50 text-green-700" : "bg-bg-light text-muted")}>
                              {l.active ? "Active" : "Inactive"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-3 text-[12px] font-semibold">
                            <Link to="/lenders/$lenderId" params={{ lenderId: l.id }} className="text-navy hover:underline">
                              View
                            </Link>
                            {isAdmin && (
                              <Link to="/lenders/$lenderId/edit" params={{ lenderId: l.id }} className="text-muted hover:text-navy hover:underline">
                                Edit
                              </Link>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <p className="mt-3 text-[12px] text-muted">
              Lenders marked visible are served to the website's partner directory at
              <code className="mx-1 rounded bg-bg-light px-1">/crm/api/public/lenders</code>. Switching a lender off removes it from the website and the assignment lists.
            </p>
          </>
        )}

        {bulk && <BulkPolicyModal lenders={all} onClose={() => setBulk(false)} />}
      </div>
    </>
  );
}
