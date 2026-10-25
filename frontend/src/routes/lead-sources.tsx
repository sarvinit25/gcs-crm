import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import { TableSkeleton } from "../components/skeleton";

type LeadSource = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  leadCount: number;
};

export function LeadSourcesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // `null` = closed, `"new"` = adding, otherwise the source being edited.
  const [form, setForm] = useState<LeadSource | "new" | null>(null);

  const query = useQuery({
    queryKey: ["lead-sources"],
    queryFn: () => api<LeadSource[]>("/lead-sources"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["lead-sources"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing-channels"] });
  };

  const save = useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & Record<string, unknown>) =>
      id
        ? api(`/lead-sources/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/lead-sources", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: (s: LeadSource) =>
      api(`/lead-sources/${s.id}`, { method: "PATCH", body: JSON.stringify({ active: !s.active }) }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/lead-sources/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const needle = search.trim().toLowerCase();
  const rows = (query.data ?? []).filter(
    (s) =>
      !needle ||
      s.name.toLowerCase().includes(needle) ||
      s.description?.toLowerCase().includes(needle),
  );
  const rowError = [toggle, remove].find((m) => m.isError)?.error as Error | undefined;

  return (
    <>
      <PageHeader
        title="Lead Sources"
        subtitle="Where your leads come from — these are the choices on every lead form and in marketing reports"
        actions={
          <button onClick={() => setForm("new")} className="btn-primary">
            <Plus className="h-4 w-4" /> Add lead source
          </button>
        }
      />

      <div className="px-6 py-5">
        {rowError && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {rowError.message}
          </p>
        )}

        <label className="relative mb-3 block max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lead sources…"
            className="field w-full pl-9"
          />
        </label>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : !rows.length ? (
            <p className="py-16 text-center text-sm text-muted">
              {needle ? "No lead source matches your search." : "No lead sources yet."}
            </p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Order</th>
                  <th className="px-4 py-2.5 font-bold">Name</th>
                  <th className="px-4 py-2.5 font-bold">Leads</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  return (
                    <tr key={s.id} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3 text-muted">{s.sortOrder}</td>
                      <td className="px-4 py-3">
                        <p className={clsx("font-semibold text-navy", !s.active && "opacity-50")}>
                          {s.name}
                        </p>
                        {s.description && (
                          <p className="text-[12px] text-muted">{s.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{s.leadCount}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggle.mutate(s)}
                          disabled={toggle.isPending}
                          title={s.active ? "Click to switch off" : "Click to switch on"}
                          className={clsx(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                            s.active ? "bg-green-50 text-green-700" : "bg-bg-light text-muted",
                          )}
                        >
                          {s.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setForm(s)}
                            className="rounded p-1.5 text-muted transition hover:bg-bg-light hover:text-navy"
                            title="Edit"
                            aria-label={`Edit ${s.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              window.confirm(`Delete the lead source "${s.name}"?`) &&
                              remove.mutate(s.id)
                            }
                            className="rounded p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                            aria-label={`Delete ${s.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {form && (
        <SourceForm
          source={form === "new" ? null : form}
          saving={save.isPending}
          error={save.isError ? (save.error as Error).message : null}
          onClose={() => {
            save.reset();
            setForm(null);
          }}
          onSave={(body) => save.mutate({ id: form === "new" ? undefined : form.id, ...body })}
        />
      )}
    </>
  );
}

function SourceForm({
  source,
  saving,
  error,
  onClose,
  onSave,
}: {
  source: LeadSource | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  return (
    <Modal title={source ? "Edit lead source" : "Add lead source"} onClose={onClose} maxWidth="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const order = String(f.get("sortOrder") ?? "").trim();
          onSave({
            name: String(f.get("name")).trim(),
            description: String(f.get("description")).trim() || null,
            // Left blank on a new source, the server puts it at the end of the list.
            ...(order ? { sortOrder: Number(order) } : {}),
          });
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy sm:col-span-2">
          Name <span className="sr-only">(required)</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={60}
            defaultValue={source?.name}
            placeholder="e.g. Walk-in"
            className="field font-normal"
          />
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Display order
          <input
            name="sortOrder"
            type="number"
            min={0}
            max={9999}
            defaultValue={source?.sortOrder}
            placeholder="Next free number"
            className="field font-normal"
          />
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy sm:col-span-2">
          Description
          <textarea
            name="description"
            rows={2}
            maxLength={200}
            defaultValue={source?.description ?? ""}
            placeholder="Optional — what counts as this source"
            className="field font-normal"
          />
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
