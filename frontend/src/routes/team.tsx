import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { useAuth } from "../lib/auth";
import { ROLE_LABEL, type Role } from "../lib/types";
import { PageHeader } from "../components/app-shell";

type Staff = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  designation: string | null;
  active: boolean;
  createdAt: string;
};

const ROLES: Role[] = ["ADMIN", "MANAGER", "ADVISOR"];

const ROLE_TONE: Record<Role, string> = {
  ADMIN: "bg-navy/8 text-navy",
  MANAGER: "bg-gold-pale text-gold-dark",
  ADVISOR: "bg-sky-50 text-sky-700",
};

export function TeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [resetting, setResetting] = useState<Staff | null>(null);

  const query = useQuery({
    queryKey: ["team", { includeInactive }],
    queryFn: () => api<Staff[]>(`/team?includeInactive=${includeInactive}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["team"] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/team", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowForm(false);
      void invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/team/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => void invalidate(),
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api(`/team/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: () => setResetting(null),
  });

  const error = [create, update, resetPassword].find((m) => m.isError)?.error;

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Staff accounts and what each role can reach"
        actions={
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <UserPlus className="h-4 w-4" /> Add staff
          </button>
        }
      />

      <div className="px-6 py-5">
        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
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
                email: f.get("email"),
                phone: f.get("phone") || undefined,
                role: f.get("role"),
                designation: f.get("designation") || undefined,
                password: f.get("password"),
              });
            }}
            className="card mb-4 grid gap-2 p-4 sm:grid-cols-3"
          >
            <input name="name" required placeholder="Full name" className="field" />
            <input name="email" type="email" required placeholder="Email" className="field" />
            <input name="phone" placeholder="10-digit phone" className="field" />
            <select name="role" defaultValue="ADVISOR" className="field">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <input name="designation" placeholder="Designation" className="field" />
            <input
              name="password"
              type="text"
              required
              minLength={10}
              placeholder="Password (min 10 chars)"
              className="field"
            />
            <div className="sm:col-span-3">
              <button type="submit" disabled={create.isPending} className="btn-primary">
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Create account
              </button>
              <p className="mt-2 text-[12px] text-muted">
                Share the password with the staff member directly — it is never shown again.
              </p>
            </div>
          </form>
        )}

        <label className="mb-3 flex items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Show deactivated accounts
        </label>

        <div className="card overflow-hidden">
          {query.isPending ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
            </div>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Name</th>
                  <th className="px-4 py-2.5 font-bold">Contact</th>
                  <th className="px-4 py-2.5 font-bold">Role</th>
                  <th className="px-4 py-2.5 font-bold">Added</th>
                  <th className="px-4 py-2.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.map((s) => (
                  <tr
                    key={s.id}
                    className={clsx(
                      "border-b border-line/70 last:border-0",
                      !s.active && "opacity-50",
                    )}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">
                        {s.name}
                        {s.id === user?.id && (
                          <span className="ml-2 text-[11px] font-bold text-gold-dark">YOU</span>
                        )}
                      </p>
                      <p className="text-[12px] text-muted">{s.designation ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {s.email}
                      {s.phone && <p className="text-[12px]">{s.phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={s.role}
                        disabled={s.id === user?.id || update.isPending}
                        onChange={(e) => update.mutate({ id: s.id, role: e.target.value })}
                        className={clsx(
                          "rounded-full border-0 px-2 py-1 text-[11px] font-bold",
                          ROLE_TONE[s.role],
                        )}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(s.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setResetting(s)}
                          className="text-[12px] font-semibold text-navy hover:text-gold-dark"
                        >
                          <KeyRound className="mr-1 inline h-3 w-3" />
                          Reset password
                        </button>
                        {s.id !== user?.id && (
                          <button
                            onClick={() => update.mutate({ id: s.id, active: !s.active })}
                            className="text-[12px] font-semibold text-muted hover:text-red-600"
                          >
                            {s.active ? "Deactivate" : "Reactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {resetting && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                resetPassword.mutate({
                  id: resetting.id,
                  password: f.get("password") as string,
                });
              }}
              className="card w-full max-w-sm p-5"
            >
              <h2 className="text-sm font-bold text-navy">Reset password</h2>
              <p className="mt-1 text-[13px] text-muted">
                Setting a new password for {resetting.name}.
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
                <button type="submit" disabled={resetPassword.isPending} className="btn-primary">
                  {resetPassword.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Set password
                </button>
                <button type="button" onClick={() => setResetting(null)} className="btn-ghost">
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
