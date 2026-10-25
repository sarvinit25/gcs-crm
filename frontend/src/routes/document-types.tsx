import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe2, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import { TableSkeleton } from "../components/skeleton";
import { CHECKLIST_APPLICANT_TYPE_LABEL, type ChecklistApplicantType } from "../lib/types";

type DocumentType = {
  id: string;
  name: string;
  code: string | null;
  category: string;
  description: string | null;
  loanProducts: { id: string; name: string }[];
  applicantTypes: ChecklistApplicantType[];
  sortOrder: number;
  active: boolean;
};

type LoanOption = { id: string; name: string; category: string | null };

const PROFILES = Object.keys(CHECKLIST_APPLICANT_TYPE_LABEL) as ChecklistApplicantType[];

/** A few chips and a "+N more" for the rest, so a long list does not stretch the row. */
function Chips({ items, empty, max = 2 }: { items: string[]; empty: string; max?: number }) {
  if (!items.length) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700">
        <Globe2 className="h-3 w-3" /> {empty}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1" title={items.join(", ")}>
      {items.slice(0, max).map((i) => (
        <span key={i} className="rounded-full bg-bg-light px-2 py-0.5 text-[11px] font-semibold text-navy">
          {i}
        </span>
      ))}
      {items.length > max && (
        <span className="rounded-full bg-bg-light px-2 py-0.5 text-[11px] font-semibold text-muted">
          +{items.length - max} more
        </span>
      )}
    </span>
  );
}

export function DocumentTypesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loanFilter, setLoanFilter] = useState("");
  // `null` = closed, `"new"` = adding, otherwise the document type being edited.
  const [form, setForm] = useState<DocumentType | "new" | null>(null);

  const query = useQuery({
    queryKey: ["document-types"],
    queryFn: () => api<DocumentType[]>("/document-types"),
  });
  const categories = useQuery({
    queryKey: ["document-categories"],
    queryFn: () => api<string[]>("/document-types/categories"),
  });
  const loans = useQuery({
    queryKey: ["loan-types"],
    queryFn: () => api<(LoanOption & { active: boolean })[]>("/loan-types"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["document-types"] });
    void queryClient.invalidateQueries({ queryKey: ["loan-types"] });
    void queryClient.invalidateQueries({ queryKey: ["checklist"] });
  };

  const save = useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & Record<string, unknown>) =>
      id
        ? api(`/document-types/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/document-types", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: (d: DocumentType) =>
      api(`/document-types/${d.id}`, { method: "PATCH", body: JSON.stringify({ active: !d.active }) }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/document-types/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const needle = search.trim().toLowerCase();
  const rows = (query.data ?? []).filter(
    (d) =>
      (!category || d.category === category) &&
      // A document for every loan type also applies to the one being filtered on.
      (!loanFilter || !d.loanProducts.length || d.loanProducts.some((p) => p.id === loanFilter)) &&
      (!needle ||
        d.name.toLowerCase().includes(needle) ||
        d.code?.toLowerCase().includes(needle) ||
        d.description?.toLowerCase().includes(needle)),
  );
  const rowError = [toggle, remove].find((m) => m.isError)?.error as Error | undefined;

  return (
    <>
      <PageHeader
        title="Document Types"
        subtitle="The documents a case can need — and which loan types and applicant profiles each is asked for"
        actions={
          <button onClick={() => setForm("new")} className="btn-primary">
            <Plus className="h-4 w-4" /> Add document type
          </button>
        }
      />

      <div className="px-6 py-5">
        {rowError && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {rowError.message}
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="relative block w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search document types…"
              className="field w-full pl-9"
            />
          </label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="field w-auto" aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={loanFilter} onChange={(e) => setLoanFilter(e.target.value)} className="field w-auto" aria-label="Filter by loan type">
            <option value="">All loan types</option>
            {loans.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {!query.isPending && (
            <span className="text-[12px] text-muted">
              {rows.length} of {query.data?.length ?? 0}
            </span>
          )}
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : !rows.length ? (
            <p className="py-16 text-center text-sm text-muted">
              {needle || category || loanFilter ? "No document type matches." : "No document types yet."}
            </p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Order</th>
                  <th className="px-4 py-2.5 font-bold">Name</th>
                  <th className="px-4 py-2.5 font-bold">Code</th>
                  <th className="px-4 py-2.5 font-bold">Category</th>
                  <th className="px-4 py-2.5 font-bold">Loan types</th>
                  <th className="px-4 py-2.5 font-bold">Applicant</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-3 text-muted">{d.sortOrder}</td>
                    <td className="wrap max-w-md px-4 py-3">
                      <p className={clsx("font-semibold text-navy", !d.active && "opacity-50")}>{d.name}</p>
                      {d.description && <p className="text-[12px] text-muted">{d.description}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-navy">{d.code ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{d.category}</td>
                    <td className="px-4 py-3">
                      <Chips items={d.loanProducts.map((p) => p.name)} empty="All loan types" />
                    </td>
                    <td className="px-4 py-3">
                      <Chips
                        items={d.applicantTypes.map((t) => CHECKLIST_APPLICANT_TYPE_LABEL[t])}
                        empty="All profiles"
                        max={3}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggle.mutate(d)}
                        disabled={toggle.isPending}
                        title={d.active ? "Click to switch off" : "Click to switch on"}
                        className={clsx(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                          d.active ? "bg-green-50 text-green-700" : "bg-bg-light text-muted",
                        )}
                      >
                        {d.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setForm(d)}
                          className="rounded p-1.5 text-muted transition hover:bg-bg-light hover:text-navy"
                          title="Edit"
                          aria-label={`Edit ${d.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            window.confirm(`Delete the document type "${d.name}"?`) && remove.mutate(d.id)
                          }
                          className="rounded p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                          aria-label={`Delete ${d.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {form && (
        <DocumentTypeForm
          type={form === "new" ? null : form}
          categories={categories.data ?? []}
          loans={loans.data ?? []}
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

/** "All …" plus one chip per choice; nothing picked means all, which is what the "All" chip shows. */
function ChipPicker<T extends string>({
  label,
  allLabel,
  options,
  selected,
  onChange,
  hint,
}: {
  label: string;
  allLabel: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  hint: string;
}) {
  const chip = (on: boolean) =>
    clsx(
      "rounded-full border px-3 py-1 text-[12px] font-semibold transition",
      on ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:text-navy",
    );
  return (
    <div className="sm:col-span-2">
      <p className="mb-1.5 text-[12px] font-semibold text-navy">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onChange([])} className={chip(!selected.length)}>
          {allLabel}
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected.includes(o.value)}
            onClick={() =>
              onChange(selected.includes(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value])
            }
            className={chip(selected.includes(o.value))}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{hint}</p>
    </div>
  );
}

function DocumentTypeForm({
  type,
  categories,
  loans,
  saving,
  error,
  onClose,
  onSave,
}: {
  type: DocumentType | null;
  categories: string[];
  loans: (LoanOption & { active: boolean })[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [loanIds, setLoanIds] = useState<string[]>(type?.loanProducts.map((p) => p.id) ?? []);
  const [profiles, setProfiles] = useState<ChecklistApplicantType[]>(type?.applicantTypes ?? []);

  return (
    <Modal title={type ? "Edit document type" : "Add document type"} onClose={onClose} maxWidth="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const order = String(f.get("sortOrder") ?? "").trim();
          onSave({
            name: String(f.get("name")).trim(),
            category: String(f.get("category")),
            code: String(f.get("code")).trim() || null,
            description: String(f.get("description")).trim() || null,
            loanProductIds: loanIds,
            applicantTypes: profiles,
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
            maxLength={200}
            defaultValue={type?.name}
            placeholder="e.g. Latest 6 months' bank statements"
            className="field font-normal"
          />
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Category
          <select name="category" required defaultValue={type?.category ?? categories[0] ?? ""} className="field font-normal">
            {[...new Set([...(type ? [type.category] : []), ...categories])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="text-[11px] font-normal text-muted">
            The folder a received copy is filed under — it ticks this document off.
          </span>
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Code
          <input
            name="code"
            maxLength={30}
            defaultValue={type?.code ?? ""}
            placeholder="e.g. BANK_STMT_6M"
            className="field font-mono font-normal uppercase"
          />
          <span className="text-[11px] font-normal text-muted">Optional.</span>
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy sm:col-span-2">
          What to ask the customer for
          <textarea
            name="description"
            rows={2}
            maxLength={300}
            defaultValue={type?.description ?? ""}
            placeholder="Optional — e.g. last 6 months, PDF downloaded from net banking"
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
            defaultValue={type?.sortOrder}
            placeholder="Next free number"
            className="field font-normal"
          />
        </label>
        <span className="hidden sm:block" />

        <ChipPicker
          label="Loan types"
          allLabel="All loan types"
          options={loans.filter((l) => l.active || loanIds.includes(l.id)).map((l) => ({ value: l.id, label: l.name }))}
          selected={loanIds}
          onChange={setLoanIds}
          hint="Pick the loans that need this document, or leave on “All loan types” for a document every file needs (PAN, Aadhaar …)."
        />
        <ChipPicker
          label="Applicant profile"
          allLabel="All profiles"
          options={PROFILES.map((p) => ({ value: p, label: CHECKLIST_APPLICANT_TYPE_LABEL[p] }))}
          selected={profiles}
          onChange={setProfiles}
          hint="Pick who is asked for it (for example salary slips for Salaried only), or leave on “All profiles”."
        />

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
