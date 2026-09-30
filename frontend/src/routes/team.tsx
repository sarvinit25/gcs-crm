import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Pencil, UserPlus } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { useAuth } from "../lib/auth";
import { ROLE_LABEL, type Role } from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import { todayIST } from "../lib/date";
import { DatePicker } from "../components/date-picker";
import { TableSkeleton } from "../components/skeleton";

type Staff = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  designation: string | null;
  active: boolean;
  createdAt: string;
  employeeCode: string | null;
  dateOfBirth: string | null;
  joinedAt: string | null;
  commissionPercent: string | null;
  reportsToId: string | null;
  reportsTo: { id: string; name: string } | null;
  totpEnabledAt: string | null;
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
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
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
      setEditing(null);
      void invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/team/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      void invalidate();
    },
  });

  const resetTwoFactor = useMutation({
    mutationFn: (id: string) => api(`/team/${id}/reset-2fa`, { method: "POST" }),
    onSuccess: () => void invalidate(),
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api(`/team/${id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: () => setResetting(null),
  });

  const error = [create, update, resetPassword, resetTwoFactor].find((m) => m.isError)?.error;

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Staff accounts and what each role can reach"
        actions={
          <button onClick={() => setEditing("new")} className="btn-primary">
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

        <label className="mb-3 flex items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Show deactivated accounts
        </label>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Member</th>
                  <th className="px-4 py-2.5 font-bold">Code</th>
                  <th className="px-4 py-2.5 font-bold">Role</th>
                  <th className="px-4 py-2.5 font-bold">Contact</th>
                  <th className="px-4 py-2.5 font-bold">DOB</th>
                  <th className="px-4 py-2.5 font-bold">Joined</th>
                  <th className="px-4 py-2.5 font-bold">Reports to</th>
                  <th className="px-4 py-2.5 font-bold">Comm. %</th>
                  <th className="px-4 py-2.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.map((s) => (
                  <tr
                    id={`row-${s.id}`}
                    key={s.id}
                    className={clsx(
                      "border-b border-line/70 last:border-0",
                      !s.active && "opacity-50",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy/8 text-[11px] font-bold text-navy">
                          {s.name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                        </span>
                        <div>
                          <p className="font-semibold text-navy">
                            {s.name}
                            {s.id === user?.id && (
                              <span className="ml-2 text-[11px] font-bold text-gold-dark">YOU</span>
                            )}
                            {s.totpEnabledAt && (
                              <span title="Two-step login is on" className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                2FA
                              </span>
                            )}
                          </p>
                          <p className="text-[12px] text-muted">{s.designation ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-navy">{s.employeeCode ?? "—"}</td>
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
                    <td className="px-4 py-3 text-muted">
                      {s.email}
                      {s.phone && <p className="text-[12px]">{s.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{s.dateOfBirth ? formatDate(s.dateOfBirth) : "—"}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(s.joinedAt ?? s.createdAt)}</td>
                    <td className="px-4 py-3 text-muted">{s.reportsTo?.name ?? "Top level"}</td>
                    <td className="px-4 py-3 font-semibold text-navy">
                      {s.commissionPercent != null ? `${Number(s.commissionPercent)}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setEditing(s)}
                          className="text-[12px] font-semibold text-navy hover:text-gold-dark"
                        >
                          <Pencil className="mr-1 inline h-3 w-3" />
                          Edit
                        </button>
                        {s.totpEnabledAt && s.id !== user?.id && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Turn off two-step login for ${s.name}? Use this when they've lost or replaced their phone.`)) resetTwoFactor.mutate(s.id);
                            }}
                            className="text-[12px] font-semibold text-muted hover:text-red-600"
                          >
                            Reset 2FA
                          </button>
                        )}
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

        {editing && (
          <StaffForm
            staff={editing === "new" ? null : editing}
            staffList={query.data ?? []}
            pending={create.isPending || update.isPending}
            error={create.isError ? (create.error as Error).message : update.isError ? (update.error as Error).message : null}
            onClose={() => setEditing(null)}
            onSubmit={(body) =>
              editing === "new" ? create.mutate(body) : update.mutate({ id: editing.id, ...body })
            }
          />
        )}

        {resetting && (
          <div className="overlay-enter fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                resetPassword.mutate({
                  id: resetting.id,
                  password: f.get("password") as string,
                });
              }}
              className="card dialog-enter w-full max-w-sm p-5"
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

const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

function StaffForm({
  staff,
  staffList,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  staff: Staff | null;
  staffList: Staff[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const isNew = !staff;
  return (
    <Modal
      title={isNew ? "Add staff member" : `Edit ${staff.name}`}
      subtitle={isNew ? "Create an account and place them in the reporting hierarchy" : staff.employeeCode ?? undefined}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const commission = f.get("commissionPercent") as string;
          const body: Record<string, unknown> = {
            name: f.get("name"),
            phone: f.get("phone") || undefined,
            role: f.get("role"),
            designation: f.get("designation") || undefined,
            dateOfBirth: f.get("dateOfBirth") || undefined,
            joinedAt: f.get("joinedAt") || undefined,
            reportsToId: (f.get("reportsToId") as string) || (isNew ? undefined : ""),
            commissionPercent: commission === "" ? undefined : Number(commission),
          };
          if (isNew) {
            body.email = f.get("email");
            body.password = f.get("password");
          }
          onSubmit(body);
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className="text-[12px] font-semibold text-muted">
          Full name *
          <input name="name" required defaultValue={staff?.name} className="field mt-1" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Email *
          <input
            name="email"
            type="email"
            required
            disabled={!isNew}
            defaultValue={staff?.email}
            className="field mt-1 disabled:opacity-60"
          />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Phone
          <input name="phone" defaultValue={staff?.phone ?? ""} placeholder="10-digit mobile" className="field mt-1" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Designation
          <input name="designation" defaultValue={staff?.designation ?? ""} className="field mt-1" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Role *
          <select name="role" defaultValue={staff?.role ?? "ADVISOR"} className="field mt-1">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Reports to
          <select name="reportsToId" defaultValue={staff?.reportsToId ?? ""} className="field mt-1">
            <option value="">Top level</option>
            {staffList
              .filter((s) => s.id !== staff?.id && s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({ROLE_LABEL[s.role]})
                </option>
              ))}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Date of birth
          <DatePicker
            name="dateOfBirth"
            defaultValue={toDateInput(staff?.dateOfBirth)}
            className="mt-1"
            minYear={1940}
            max={todayIST()}
            placeholder="Date of birth"
          />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Joining date
          <DatePicker name="joinedAt" defaultValue={toDateInput(staff?.joinedAt) || todayIST()} className="mt-1" placeholder="Joining date" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Commission %
          <input
            name="commissionPercent"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={staff?.commissionPercent != null ? Number(staff.commissionPercent) : ""}
            className="field mt-1"
          />
        </label>
        {isNew && (
          <label className="text-[12px] font-semibold text-muted">
            Password * (min 10 chars)
            <input name="password" type="text" required minLength={10} className="field mt-1" />
          </label>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:col-span-2">{error}</p>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isNew ? "Create account" : "Save changes"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
        </div>
        {isNew && (
          <p className="text-[12px] text-muted sm:col-span-2">
            Share the password with the staff member directly — it is never shown again.
          </p>
        )}
      </form>
    </Modal>
  );
}
