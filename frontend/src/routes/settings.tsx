import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import {
  CHECKLIST_APPLICANT_TYPE_LABEL,
  type ChecklistApplicantType,
  type ChecklistItem,
} from "../lib/types";

const CHECKLIST_APPLICANT_TYPES = Object.keys(
  CHECKLIST_APPLICANT_TYPE_LABEL,
) as ChecklistApplicantType[];

type SettingType = "string" | "text" | "number" | "boolean" | "list" | "email" | "phone" | "time";

type Setting = {
  key: string;
  group: string;
  label: string;
  help?: string;
  type: SettingType;
  default: unknown;
  value: unknown;
  isDefault: boolean;
  min?: number;
  max?: number;
  publicFacing?: boolean;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  active: boolean;
  sortOrder: number;
  applicationCount: number;
};

type RateCard = {
  id: string;
  label: string;
  minRate: string;
  maxRate: string;
  avgAmountLabel: string;
  earningLabel: string;
  active: boolean;
  sortOrder: number;
};

/** One editor per setting type, so the screen is generated from the registry. */
function SettingRow({
  setting,
  onSave,
  onReset,
  saving,
}: {
  setting: Setting;
  onSave: (value: unknown) => void;
  onReset: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<unknown>(setting.value);
  const dirty = JSON.stringify(draft) !== JSON.stringify(setting.value);

  return (
    <div id={`setting-${setting.key}`} className="border-b border-line py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-navy">
            {setting.label}
            {setting.publicFacing && (
              <span className="ml-2 rounded-full bg-gold-pale px-1.5 py-0.5 text-[10px] font-bold text-gold-dark">
                PUBLIC
              </span>
            )}
            {!setting.isDefault && (
              <span className="ml-2 text-[10px] font-bold text-muted">CHANGED</span>
            )}
          </p>
          {setting.help && <p className="mt-0.5 text-[12px] text-muted">{setting.help}</p>}
        </div>

        <div className="flex w-full max-w-sm shrink-0 items-start gap-2">
          <div className="flex-1">
            {setting.type === "boolean" ? (
              <button
                onClick={() => {
                  setDraft(!draft);
                  onSave(!draft);
                }}
                className={clsx(
                  "inline-flex h-6 w-11 items-center rounded-full transition",
                  draft ? "bg-navy" : "bg-line",
                )}
              >
                <span
                  className={clsx(
                    "h-5 w-5 rounded-full bg-white transition",
                    draft ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            ) : setting.type === "list" ? (
              <textarea
                rows={Math.max(3, (draft as string[]).length)}
                value={(draft as string[]).join("\n")}
                onChange={(e) => setDraft(e.target.value.split("\n"))}
                className="field resize-y font-mono text-[12px]"
                placeholder="One per line"
              />
            ) : setting.type === "text" ? (
              <textarea
                rows={3}
                value={String(draft ?? "")}
                onChange={(e) => setDraft(e.target.value)}
                className="field resize-y"
              />
            ) : (
              <input
                type={setting.type === "number" ? "number" : setting.type === "time" ? "time" : "text"}
                min={setting.min}
                max={setting.max}
                value={String(draft ?? "")}
                onChange={(e) =>
                  setDraft(setting.type === "number" ? Number(e.target.value) : e.target.value)
                }
                className="field"
              />
            )}
          </div>

          {setting.type !== "boolean" && (
            <button
              onClick={() => onSave(draft)}
              disabled={!dirty || saving}
              className={clsx("btn-primary shrink-0 px-3", !dirty && "invisible")}
              title="Save"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          )}

          <button
            onClick={() => {
              setDraft(setting.default);
              onReset();
            }}
            disabled={setting.isDefault}
            className={clsx(
              "shrink-0 rounded p-2 text-muted transition hover:bg-bg-light hover:text-navy",
              setting.isDefault && "invisible",
            )}
            title="Reset to default"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LoanProducts() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const query = useQuery({
    queryKey: ["admin-loan-products"],
    queryFn: () => api<Product[]>("/settings/loan-products"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-loan-products"] });
    void queryClient.invalidateQueries({ queryKey: ["loan-products"] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/settings/loan-products", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowForm(false);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/settings/loan-products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const error = [create, update].find((m) => m.isError)?.error;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-muted">
          The loan products offered across leads and applications.
        </p>
        <button onClick={() => setShowForm(!showForm)} className="btn-ghost">
          <Plus className="h-4 w-4" /> Add product
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {(error as Error).message}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              name: f.get("name"),
              slug: f.get("slug"),
              category: f.get("category") || undefined,
            });
          }}
          className="mb-3 grid gap-2 rounded-lg bg-bg-light p-3 sm:grid-cols-4"
        >
          <input name="name" required placeholder="Product name" className="field" />
          <input
            name="slug"
            required
            placeholder="url-slug"
            pattern="[a-z0-9-]+"
            title="Lowercase letters, numbers and hyphens"
            className="field"
          />
          <input name="category" placeholder="Category" className="field" />
          <button type="submit" disabled={create.isPending} className="btn-primary">
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </button>
          <p className="text-[12px] text-muted sm:col-span-4">
            The slug must match the website's product URL for lead intake to map enquiries to this
            product.
          </p>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-line">
        {query.isPending ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-2.5 font-bold">Product</th>
                <th className="px-4 py-2.5 font-bold">Slug</th>
                <th className="px-4 py-2.5 font-bold">Category</th>
                <th className="px-4 py-2.5 font-bold">In use</th>
                <th className="px-4 py-2.5 font-bold">Active</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((p) => (
                <tr
                  key={p.id}
                  className={clsx("border-b border-line/70 last:border-0", !p.active && "opacity-50")}
                >
                  <td className="px-4 py-2.5 font-semibold text-navy">{p.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-muted">{p.slug}</td>
                  <td className="px-4 py-2.5 text-muted">{p.category ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{p.applicationCount}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => update.mutate({ id: p.id, active: !p.active })}
                      className="text-[12px] font-semibold text-muted hover:text-navy"
                    >
                      {p.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Master checklist data — which documents a case needs, by product and applicant profile. */
function ChecklistItems() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const query = useQuery({
    queryKey: ["admin-checklist-items"],
    queryFn: () => api<ChecklistItem[]>("/settings/checklist-items"),
  });
  const products = useQuery({
    queryKey: ["admin-loan-products"],
    queryFn: () => api<Product[]>("/settings/loan-products"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-checklist-items"] });
    void queryClient.invalidateQueries({ queryKey: ["checklist"] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/settings/checklist-items", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowForm(false);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/settings/checklist-items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/settings/checklist-items/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const error = [create, update, remove].find((m) => m.isError)?.error;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-muted">
          What documents a case needs, branched by loan product and by the primary applicant's
          profile. Leave "Any product" / "Any applicant type" to apply an item everywhere.
        </p>
        <button onClick={() => setShowForm(!showForm)} className="btn-ghost">
          <Plus className="h-4 w-4" /> Add item
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {(error as Error).message}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            create.mutate({
              label: f.get("label"),
              category: f.get("category"),
              loanProductId: f.get("loanProductId") || undefined,
              applicantType: f.get("applicantType") || undefined,
            });
            e.currentTarget.reset();
          }}
          className="mb-3 grid gap-2 rounded-lg bg-bg-light p-3 sm:grid-cols-4"
        >
          <input name="label" required placeholder="Document label" className="field sm:col-span-2" />
          <input name="category" required placeholder="Category" className="field" />
          <select name="loanProductId" defaultValue="" className="field">
            <option value="">Any product</option>
            {products.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="applicantType" defaultValue="" className="field">
            <option value="">Any applicant type</option>
            {CHECKLIST_APPLICANT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CHECKLIST_APPLICANT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <button type="submit" disabled={create.isPending} className="btn-primary sm:col-span-4">
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add item
          </button>
        </form>
      )}

      <div className="max-h-[560px] overflow-y-auto rounded-lg border border-line">
        {query.isPending ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 border-b border-line bg-bg-light/95 text-[11px] tracking-wide text-muted uppercase backdrop-blur">
              <tr>
                <th className="px-4 py-2.5 font-bold">Document</th>
                <th className="px-4 py-2.5 font-bold">Category</th>
                <th className="px-4 py-2.5 font-bold">Product</th>
                <th className="px-4 py-2.5 font-bold">Applicant type</th>
                <th className="px-4 py-2.5 font-bold">Active</th>
                <th className="px-4 py-2.5 font-bold" />
              </tr>
            </thead>
            <tbody>
              {query.data?.map((item) => (
                <tr
                  key={item.id}
                  className={clsx("border-b border-line/70 last:border-0", !item.active && "opacity-50")}
                >
                  <td className="px-4 py-2.5 font-semibold text-navy">{item.label}</td>
                  <td className="px-4 py-2.5 text-muted">{item.category}</td>
                  <td className="px-4 py-2.5 text-muted">{item.loanProduct?.name ?? "Any"}</td>
                  <td className="px-4 py-2.5 text-muted">
                    {item.applicantType ? CHECKLIST_APPLICANT_TYPE_LABEL[item.applicantType] : "Any"}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => update.mutate({ id: item.id, active: !item.active })}
                      className="text-[12px] font-semibold text-muted hover:text-navy"
                    >
                      {item.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => remove.mutate(item.id)}
                      className="rounded p-1 text-muted transition hover:bg-red-50 hover:text-red-600"
                      title="Delete item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * The referral commission structure published to the website's Partner page
 * and the partner portal — this is the tool GCS uses to enter and change
 * those figures themselves, rather than a developer editing seed data.
 */
function RateCards() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RateCard | "new" | null>(null);

  const query = useQuery({
    queryKey: ["admin-rate-cards"],
    queryFn: () => api<RateCard[]>("/settings/commission-rate-cards"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-rate-cards"] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/settings/commission-rate-cards", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/settings/commission-rate-cards/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/settings/commission-rate-cards/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const error = [create, update, remove].find((m) => m.isError)?.error;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      label: f.get("label"),
      minRate: Number(f.get("minRate")),
      maxRate: Number(f.get("maxRate")),
      avgAmountLabel: f.get("avgAmountLabel"),
      earningLabel: f.get("earningLabel"),
    };
    if (editing === "new") create.mutate(body);
    else if (editing) update.mutate({ id: editing.id, ...body });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-muted">
          Published on the website's Partner page and in the partner portal, at{" "}
          <code className="rounded bg-bg-light px-1">/crm/api/public/commission-structure</code>.
        </p>
        <button onClick={() => setEditing("new")} className="btn-ghost">
          <Plus className="h-4 w-4" /> Add rate card
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {(error as Error).message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-line">
        {query.isPending ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-2.5 font-bold">Loan Product</th>
                <th className="px-4 py-2.5 font-bold">Rate Range</th>
                <th className="px-4 py-2.5 font-bold">Avg. Amount</th>
                <th className="px-4 py-2.5 font-bold">Earning / Deal</th>
                <th className="px-4 py-2.5 font-bold">Active</th>
                <th className="px-4 py-2.5 font-bold" />
              </tr>
            </thead>
            <tbody>
              {query.data?.map((c) => (
                <tr
                  key={c.id}
                  className={clsx("border-b border-line/70 last:border-0", !c.active && "opacity-50")}
                >
                  <td className="px-4 py-2.5 font-semibold text-navy">{c.label}</td>
                  <td className="px-4 py-2.5 text-muted">
                    {c.minRate}% – {c.maxRate}%
                  </td>
                  <td className="px-4 py-2.5 text-muted">{c.avgAmountLabel}</td>
                  <td className="px-4 py-2.5 font-medium text-gold-dark">{c.earningLabel}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => update.mutate({ id: c.id, active: !c.active })}
                      className="text-[12px] font-semibold text-muted hover:text-navy"
                    >
                      {c.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(c)}
                        className="rounded p-1 text-muted transition hover:bg-bg-light hover:text-navy"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => remove.mutate(c.id)}
                        className="rounded p-1 text-muted transition hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <Modal
          title={editing === "new" ? "Add rate card" : "Edit rate card"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={submit} className="grid gap-2.5">
            <input
              name="label"
              required
              defaultValue={editing === "new" ? "" : editing.label}
              placeholder="Loan product (e.g. Home Loan)"
              className="field"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <input
                name="minRate"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={editing === "new" ? "" : editing.minRate}
                placeholder="Min rate %"
                className="field"
              />
              <input
                name="maxRate"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={editing === "new" ? "" : editing.maxRate}
                placeholder="Max rate %"
                className="field"
              />
            </div>
            <input
              name="avgAmountLabel"
              required
              defaultValue={editing === "new" ? "" : editing.avgAmountLabel}
              placeholder="Avg. amount (e.g. ₹30L – ₹1Cr)"
              className="field"
            />
            <input
              name="earningLabel"
              required
              defaultValue={editing === "new" ? "" : editing.earningLabel}
              placeholder="Earning per deal (e.g. ₹6,000 – ₹50,000)"
              className="field"
            />

            <div className="mt-3 flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" onClick={() => setEditing(null)} className="btn-ghost">
                Cancel
              </button>
              <button
                type="submit"
                disabled={create.isPending || update.isPending}
                className="btn-primary"
              >
                {create.isPending || update.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [group, setGroup] = useState("Organisation");
  const hash = useRouterState({ select: (s) => s.location.hash });

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ groups: string[]; settings: Setting[] }>("/settings"),
  });

  // A link like /settings#setting-numbering.financialYear (from search) opens the right tab first.
  useEffect(() => {
    const named: Record<string, string> = {
      products: "Loan products",
      checklist: "Document checklist",
      ratecards: "Commission rate cards",
    };
    if (named[hash]) setGroup(named[hash]);
    else if (hash.startsWith("setting-")) {
      const found = query.data?.settings.find((s) => `setting-${s.key}` === hash);
      if (found) setGroup(found.group);
    }
  }, [hash, query.data]);

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api(`/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const reset = useMutation({
    mutationFn: (key: string) => api(`/settings/${key}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const tabs = [
    ...(query.data?.groups ?? []),
    "Loan products",
    "Document checklist",
    "Commission rate cards",
  ];
  const inGroup = (query.data?.settings ?? []).filter((s) => s.group === group);
  const changed = (query.data?.settings ?? []).filter((s) => !s.isDefault).length;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={
          query.data ? `${query.data.settings.length} settings · ${changed} changed` : "Configuration"
        }
      />

      <div className="px-6 py-5">
        {save.isError && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {(save.error as Error).message}
          </p>
        )}

        <div className="mb-4 flex flex-wrap gap-1">
          {tabs.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={
                group === g
                  ? "rounded-md bg-navy px-3 py-1.5 text-[13px] font-semibold text-white"
                  : "rounded-md border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-navy"
              }
            >
              {g}
            </button>
          ))}
        </div>

        <div className="card p-5">
          {group === "Loan products" ? (
            <LoanProducts />
          ) : group === "Document checklist" ? (
            <ChecklistItems />
          ) : group === "Commission rate cards" ? (
            <RateCards />
          ) : query.isPending ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : query.isError ? (
            <p className="py-12 text-center text-sm text-red-600">
              {(query.error as Error).message}
            </p>
          ) : (
            inGroup.map((s) => (
              <SettingRow
                // Re-mounts after a save so the editor shows what was stored.
                key={`${s.key}:${JSON.stringify(s.value)}`}
                setting={s}
                saving={save.isPending}
                onSave={(value) => save.mutate({ key: s.key, value })}
                onReset={() => reset.mutate(s.key)}
              />
            ))
          )}
        </div>

        {group !== "Loan products" &&
          group !== "Document checklist" &&
          group !== "Commission rate cards" && (
          <p className="mt-3 text-[12px] text-muted">
            Settings marked PUBLIC are served to the website at
            <code className="mx-1 rounded bg-bg-light px-1">/crm/api/public/settings</code>. Every
            change is recorded in the audit log.
          </p>
        )}
      </div>
    </>
  );
}
