import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Pencil, UserPlus } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { PageHeader } from "../components/app-shell";
import { TableSkeleton } from "../components/skeleton";
import { PartnerForm } from "../components/partner-form";

type Partner = {
  id: string;
  code: string | null;
  managerId: string | null;
  manager: { id: string; name: string } | null;
  name: string;
  firm: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  bankName: string | null;
  accountLast4: string | null;
  commissionRate: string;
  active: boolean;
  hasPortalAccess: boolean;
  leadCount: number;
  convertedCount: number;
};

export function PartnersPage() {
  const queryClient = useQueryClient();
  // `null` = closed, `"new"` = adding, otherwise the partner being edited.
  const [form, setForm] = useState<Partner | "new" | null>(null);
  const [settingPassword, setSettingPassword] = useState<Partner | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  const query = useQuery({
    queryKey: ["partners", { includeInactive }],
    queryFn: () => api<Partner[]>(`/partners?includeInactive=${includeInactive}`),
  });

  const staff = useQuery({
    queryKey: ["team-assignable"],
    queryFn: () => api<{ id: string; name: string }[]>("/team/assignable"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["partners"] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/partners", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setForm(null);
      void invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/partners/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setForm(null);
      void invalidate();
    },
  });

  const setPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api(`/partners/${id}/set-password`, { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: () => {
      setSettingPassword(null);
      void invalidate();
    },
  });

  // Create and edit errors show inside their own dialog.
  const error = [setPassword].find((m) => m.isError)?.error;

  return (
    <>
      <PageHeader
        title="Sourcing Partners"
        subtitle="External referrers, each on their own commission rate"
        actions={
          <button onClick={() => setForm("new")} className="btn-primary">
            <UserPlus className="h-4 w-4" /> Add partner
          </button>
        }
      />

      <div className="px-6 py-5">
        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {(error as Error).message}
          </p>
        )}

        <label className="mb-3 flex items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Show inactive partners
        </label>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : !query.data?.length ? (
            <p className="py-16 text-center text-sm text-muted">No sourcing partners yet.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Code</th>
                  <th className="px-4 py-2.5 font-bold">Partner</th>
                  <th className="px-4 py-2.5 font-bold">Contact</th>
                  <th className="px-4 py-2.5 font-bold">Reports to</th>
                  <th className="px-4 py-2.5 font-bold">Rate</th>
                  <th className="px-4 py-2.5 font-bold">Payout account</th>
                  <th className="px-4 py-2.5 font-bold">Referred</th>
                  <th className="px-4 py-2.5 font-bold">Converted</th>
                  <th className="px-4 py-2.5 font-bold">Portal</th>
                  <th className="px-4 py-2.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((p) => (
                  <tr
                    id={`row-${p.id}`}
                    key={p.id}
                    className={clsx(
                      "border-b border-line/70 last:border-0",
                      !p.active && "opacity-50",
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-[12px] text-navy">{p.code ?? "—"}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">{p.name}</p>
                      <p className="text-[12px] text-muted">{p.firm ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {p.phone}
                      {(p.city || p.state) && <p className="text-[12px]">{[p.city, p.state].filter(Boolean).join(", ")}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{p.manager?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-gold-dark">{p.commissionRate}%</td>
                    <td className="px-4 py-3 text-muted">
                      {p.accountLast4 ? (
                        <>
                          <p className="text-navy">{p.bankName ?? "Bank account"}</p>
                          <p className="font-mono text-[12px]">••••{p.accountLast4}</p>
                        </>
                      ) : (
                        <span className="text-amber-700">Not added</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{p.leadCount}</td>
                    <td className="px-4 py-3">
                      {p.convertedCount}
                      {p.leadCount > 0 && (
                        <span className="ml-1 text-[12px] text-muted">
                          ({Math.round((p.convertedCount / p.leadCount) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-[11px] font-bold",
                          p.hasPortalAccess
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {p.hasPortalAccess ? "Active" : "No access"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setForm(p)}
                          className="text-[12px] font-semibold text-navy hover:text-gold-dark"
                        >
                          <Pencil className="mr-1 inline h-3 w-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => setSettingPassword(p)}
                          className="text-[12px] font-semibold text-navy hover:text-gold-dark"
                        >
                          <KeyRound className="mr-1 inline h-3 w-3" />
                          {p.hasPortalAccess ? "Reset password" : "Set password"}
                        </button>
                        <button
                          onClick={() => update.mutate({ id: p.id, active: !p.active })}
                          className="text-[12px] font-semibold text-muted hover:text-red-600"
                        >
                          {p.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {form && (
          <PartnerForm
            partner={form === "new" ? null : form}
            staff={staff.data ?? []}
            saving={create.isPending || update.isPending}
            error={(form === "new" ? create : update).isError ? ((form === "new" ? create : update).error as Error).message : null}
            onClose={() => {
              create.reset();
              update.reset();
              setForm(null);
            }}
            onSave={(body) => (form === "new" ? create.mutate(body) : update.mutate({ id: form.id, ...body }))}
          />
        )}

        {settingPassword && (
          <div className="overlay-enter fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setPassword.mutate({
                  id: settingPassword.id,
                  password: f.get("password") as string,
                });
              }}
              className="card dialog-enter w-full max-w-sm p-5"
            >
              <h2 className="text-sm font-bold text-navy">Partner Portal password</h2>
              <p className="mt-1 text-[13px] text-muted">
                Setting a new password for {settingPassword.name}. They sign in at the Partner
                Portal with their phone number ({settingPassword.phone}) and this password.
              </p>
              <input
                name="password"
                type="text"
                required
                minLength={10}
                placeholder="New password (min 10 chars)"
                className="field mt-4"
              />
              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={setPassword.isPending} className="btn-primary">
                  {setPassword.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Set password
                </button>
                <button
                  type="button"
                  onClick={() => setSettingPassword(null)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
