import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, EyeOff, Loader2, Plus, Search } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/app-shell";
import { TableSkeleton } from "../components/skeleton";

type Lender = {
  id: string;
  name: string;
  type: "BANK" | "NBFC";
  logoUrl: string | null;
  isPublic: boolean;
  active: boolean;
  sortOrder: number;
  applicationCount: number;
};

/** The lender list and its editor. Shown as a page, or embedded as a Settings tab. */
export function LendersPanel({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const query = useQuery({
    queryKey: ["lenders-directory", { includeInactive }],
    queryFn: () => api<Lender[]>(`/lenders?includeInactive=${includeInactive}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["lenders-directory"] });
    void queryClient.invalidateQueries({ queryKey: ["lenders"] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/lenders", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowForm(false);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/lenders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const error = [create, update].find((m) => m.isError)?.error;

  const visible = (query.data ?? []).filter(
    (l) =>
      (!typeFilter || l.type === typeFilter) &&
      (!search || l.name.toLowerCase().includes(search.toLowerCase())),
  );
  const publicCount = (query.data ?? []).filter((l) => l.isPublic && l.active).length;

  const subtitle = query.data
    ? `${query.data.length} lenders · ${publicCount} shown on the website`
    : "Partner banks and NBFCs";
  const addButton = isAdmin && (
    <button onClick={() => setShowForm(!showForm)} className="btn-primary">
      <Plus className="h-4 w-4" /> Add lender
    </button>
  );

  return (
    <>
      {!embedded && <PageHeader title="Lender Directory" subtitle={subtitle} actions={addButton} />}

      <div className={embedded ? "" : "px-6 py-5"}>
        {embedded && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-navy">Banks &amp; NBFCs</h2>
              <p className="text-[13px] text-muted">{subtitle}</p>
            </div>
            {addButton}
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {(error as Error).message}
          </p>
        )}

        {showForm && isAdmin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              create.mutate({
                name: f.get("name"),
                type: f.get("type"),
                logoUrl: (f.get("logoUrl") as string) || undefined,
                sortOrder: f.get("sortOrder") ? Number(f.get("sortOrder")) : undefined,
              });
            }}
            className="card mb-4 grid gap-2 p-4 sm:grid-cols-4"
          >
            <input name="name" required placeholder="Lender name" className="field" />
            <select name="type" defaultValue="BANK" className="field">
              <option value="BANK">Bank</option>
              <option value="NBFC">NBFC</option>
            </select>
            <input name="logoUrl" placeholder="/banks/logo.svg" className="field" />
            <input name="sortOrder" type="number" min={0} placeholder="Sort order" className="field" />
            <button type="submit" disabled={create.isPending} className="btn-primary sm:col-span-4">
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add lender
            </button>
          </form>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Lender name"
              className="field w-56 pl-9"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="field w-36"
          >
            <option value="">All types</option>
            <option value="BANK">Banks</option>
            <option value="NBFC">NBFCs</option>
          </select>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Lender</th>
                  <th className="px-4 py-2.5 font-bold">Type</th>
                  <th className="px-4 py-2.5 font-bold">Applications</th>
                  <th className="px-4 py-2.5 font-bold">On website</th>
                  {isAdmin && <th className="px-4 py-2.5 font-bold">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr
                    id={`lender-${l.id}`}
                    key={l.id}
                    className={clsx(
                      "border-b border-line/70 last:border-0",
                      !l.active && "opacity-50",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-bg-light">
                          <Building2 className="h-3.5 w-3.5 text-muted" />
                        </span>
                        <div>
                          <p className="font-semibold text-navy">{l.name}</p>
                          {l.logoUrl && <p className="text-[11px] text-muted">{l.logoUrl}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-[11px] font-bold",
                          l.type === "BANK"
                            ? "bg-navy/8 text-navy"
                            : "bg-gold-pale text-gold-dark",
                        )}
                      >
                        {l.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{l.applicationCount}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <button
                          onClick={() => update.mutate({ id: l.id, isPublic: !l.isPublic })}
                          className={clsx(
                            "inline-flex items-center gap-1.5 text-[12px] font-semibold",
                            l.isPublic ? "text-emerald-700" : "text-muted",
                          )}
                        >
                          {l.isPublic ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                          {l.isPublic ? "Visible" : "Hidden"}
                        </button>
                      ) : (
                        <span className="text-[12px] text-muted">
                          {l.isPublic ? "Visible" : "Hidden"}
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => update.mutate({ id: l.id, active: !l.active })}
                          className="text-[12px] font-semibold text-muted hover:text-red-600"
                        >
                          {l.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-3 text-[12px] text-muted">
          Lenders marked visible are served to the website's partner directory at
          <code className="mx-1 rounded bg-bg-light px-1">/crm/api/public/lenders</code>.
          Deactivating one removes it from both the website and the assignment dropdowns.
        </p>
      </div>
    </>
  );
}

export const LendersPage = () => <LendersPanel />;
