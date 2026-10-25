import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatCompact } from "../lib/format";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import { TableSkeleton } from "../components/skeleton";
import { LOAN_TYPE_ICONS, loanTypeIcon } from "../lib/loan-type-icons";

type LoanType = {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  category: string | null;
  description: string | null;
  icon: string | null;
  color: string;
  secured: boolean;
  minAmount: string | null;
  maxAmount: string | null;
  sortOrder: number;
  active: boolean;
  applicationCount: number;
  leadCount: number;
  documentTypeCount: number;
};

const DEFAULT_COLOR = "#6B7280";

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const range = (t: LoanType) =>
  t.minAmount || t.maxAmount
    ? `${t.minAmount ? formatCompact(t.minAmount) : "Any"} – ${t.maxAmount ? formatCompact(t.maxAmount) : "Any"}`
    : "—";

export function LoanTypesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // `null` = closed, `"new"` = adding, otherwise the loan type being edited.
  const [form, setForm] = useState<LoanType | "new" | null>(null);

  const query = useQuery({
    queryKey: ["loan-types"],
    queryFn: () => api<LoanType[]>("/loan-types"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["loan-types"] });
    void queryClient.invalidateQueries({ queryKey: ["loan-products"] });
    void queryClient.invalidateQueries({ queryKey: ["document-types"] });
  };

  const save = useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & Record<string, unknown>) =>
      id
        ? api(`/loan-types/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/loan-types", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: (t: LoanType) =>
      api(`/loan-types/${t.id}`, { method: "PATCH", body: JSON.stringify({ active: !t.active }) }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/loan-types/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const needle = search.trim().toLowerCase();
  const rows = (query.data ?? []).filter(
    (t) =>
      !needle ||
      t.name.toLowerCase().includes(needle) ||
      t.code?.toLowerCase().includes(needle) ||
      t.category?.toLowerCase().includes(needle) ||
      t.description?.toLowerCase().includes(needle),
  );
  const rowError = [toggle, remove].find((m) => m.isError)?.error as Error | undefined;

  return (
    <>
      <PageHeader
        title="Loan Types"
        subtitle="The loans you offer — what leads and files can be raised for, and which documents each needs"
        actions={
          <button onClick={() => setForm("new")} className="btn-primary">
            <Plus className="h-4 w-4" /> Add loan type
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
            placeholder="Search loan types…"
            className="field w-full pl-9"
          />
        </label>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : !rows.length ? (
            <p className="py-16 text-center text-sm text-muted">
              {needle ? "No loan type matches your search." : "No loan types yet."}
            </p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Order</th>
                  <th className="px-4 py-2.5 font-bold">Name</th>
                  <th className="px-4 py-2.5 font-bold">Code</th>
                  <th className="px-4 py-2.5 font-bold">Icon</th>
                  <th className="px-4 py-2.5 font-bold">Colour</th>
                  <th className="px-4 py-2.5 font-bold">Type</th>
                  <th className="px-4 py-2.5 font-bold">Usual amount</th>
                  <th className="px-4 py-2.5 font-bold">Files</th>
                  <th className="px-4 py-2.5 font-bold">Documents</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const Icon = loanTypeIcon(t.icon);
                  return (
                    <tr key={t.id} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3 text-muted">{t.sortOrder}</td>
                      <td className="px-4 py-3">
                        <p className={clsx("font-semibold text-navy", !t.active && "opacity-50")}>
                          {t.name}
                        </p>
                        <p className="text-[12px] text-muted">
                          {[t.category, t.description].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-navy">{t.code ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className="grid h-7 w-7 place-items-center rounded-md text-white"
                          style={{ backgroundColor: t.color }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 font-mono text-[12px] text-muted">
                          <span
                            className="h-4 w-8 rounded"
                            style={{ backgroundColor: t.color }}
                            aria-hidden
                          />
                          {t.color.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                            t.secured ? "bg-blue-50 text-blue-700" : "bg-bg-light text-muted",
                          )}
                        >
                          {t.secured ? "Secured" : "Unsecured"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{range(t)}</td>
                      <td className="px-4 py-3 text-muted" title={`${t.leadCount} leads`}>
                        {t.applicationCount}
                      </td>
                      <td className="px-4 py-3 text-muted">{t.documentTypeCount}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggle.mutate(t)}
                          disabled={toggle.isPending}
                          title={t.active ? "Click to switch off" : "Click to switch on"}
                          className={clsx(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                            t.active ? "bg-green-50 text-green-700" : "bg-bg-light text-muted",
                          )}
                        >
                          {t.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setForm(t)}
                            className="rounded p-1.5 text-muted transition hover:bg-bg-light hover:text-navy"
                            title="Edit"
                            aria-label={`Edit ${t.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              window.confirm(`Delete the loan type "${t.name}"?`) &&
                              remove.mutate(t.id)
                            }
                            className="rounded p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                            aria-label={`Delete ${t.name}`}
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
        <LoanTypeForm
          type={form === "new" ? null : form}
          categories={[...new Set((query.data ?? []).map((t) => t.category).filter(Boolean))] as string[]}
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

const numberOrNull = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim();
  return t ? Number(t) : null;
};

function LoanTypeForm({
  type,
  categories,
  saving,
  error,
  onClose,
  onSave,
}: {
  type: LoanType | null;
  categories: string[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [color, setColor] = useState(type?.color ?? DEFAULT_COLOR);
  const [name, setName] = useState(type?.name ?? "");
  const [slug, setSlug] = useState(type?.slug ?? "");
  // A new loan type's web address follows its name until it is typed over.
  const [slugTouched, setSlugTouched] = useState(Boolean(type));

  return (
    <Modal title={type ? "Edit loan type" : "Add loan type"} onClose={onClose} maxWidth="max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const order = String(f.get("sortOrder") ?? "").trim();
          onSave({
            name: name.trim(),
            slug,
            code: String(f.get("code")).trim() || null,
            category: String(f.get("category")).trim() || null,
            icon: String(f.get("icon")) || null,
            color,
            description: String(f.get("description")).trim() || null,
            secured: f.get("secured") === "on",
            minAmount: numberOrNull(f.get("minAmount")),
            maxAmount: numberOrNull(f.get("maxAmount")),
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
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugOf(e.target.value));
            }}
            placeholder="e.g. Loan Against Gold"
            className="field font-normal"
          />
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Code
          <input
            name="code"
            maxLength={30}
            defaultValue={type?.code ?? ""}
            placeholder="e.g. LAG"
            className="field font-mono font-normal uppercase"
          />
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Category
          <input
            name="category"
            list="loan-type-categories"
            maxLength={80}
            defaultValue={type?.category ?? ""}
            placeholder="e.g. Property Finance"
            className="field font-normal"
          />
          <datalist id="loan-type-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Icon
          <select name="icon" defaultValue={type?.icon ?? ""} className="field font-normal">
            <option value="">No icon</option>
            {Object.entries(LOAN_TYPE_ICONS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Colour
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-line bg-white p-0.5"
              aria-label="Pick a colour"
            />
            <span className="font-mono text-[12px] font-normal text-muted">{color.toUpperCase()}</span>
          </span>
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
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Website address name
          <input
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            pattern="[a-z0-9\-]+"
            title="Lowercase letters, numbers and hyphens"
            className="field font-mono font-normal"
          />
          <span className="text-[11px] font-normal text-muted">
            Must match the website's page for this loan, so enquiries land here.
          </span>
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy sm:col-span-2">
          Description
          <textarea
            name="description"
            rows={2}
            maxLength={200}
            defaultValue={type?.description ?? ""}
            placeholder="Optional — what this loan is for"
            className="field font-normal"
          />
        </label>

        <p className="mt-1 border-t border-line pt-3 text-[11px] font-bold tracking-wide text-muted uppercase sm:col-span-2">
          Lending details
        </p>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-navy sm:col-span-2">
          <input name="secured" type="checkbox" defaultChecked={type?.secured} />
          Secured loan — needs collateral (property, vehicle, securities)
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Smallest usual amount (₹)
          <input
            name="minAmount"
            type="number"
            min={0}
            step={1}
            defaultValue={type?.minAmount ? Number(type.minAmount) : ""}
            placeholder="e.g. 100000"
            className="field font-normal"
          />
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Largest usual amount (₹)
          <input
            name="maxAmount"
            type="number"
            min={0}
            step={1}
            defaultValue={type?.maxAmount ? Number(type.maxAmount) : ""}
            placeholder="e.g. 50000000"
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
