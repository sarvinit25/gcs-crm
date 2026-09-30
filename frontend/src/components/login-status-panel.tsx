import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Save } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatAmount, formatDate } from "../lib/format";
import type { ApplicationDetail } from "../lib/types";
import { Modal } from "./modal";
import { DatePicker } from "./date-picker";

const DSA_CHANNELS = ["Direct", "Urban Money Pvt Ltd", "Other"];

/**
 * The bank-login leg of a file — tracked separately from the overall
 * application status, since it's its own mini-workflow: which bank contact
 * picked it up, what channel it was routed through, and what it cost to log
 * in, independent of whether the file later gets sanctioned.
 */
export function LoginStatusPanel({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  // Same query key as the parent application-detail query — reads from the
  // shared cache rather than firing a second request.
  const query = useQuery({
    queryKey: ["application", applicationId],
    queryFn: () => api<ApplicationDetail>(`/applications/${applicationId}`),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/applications/${applicationId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });

  const app = query.data;
  if (!app) return null;

  const isLoggedIn = !!app.bankLoginAt;

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy">Bank Login</h2>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              isLoggedIn ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600",
            )}
          >
            {isLoggedIn ? "Login Done" : "Not Logged In"}
          </span>
          <button onClick={() => setEditing(true)} className="btn-ghost">
            <Pencil className="h-4 w-4" /> Update
          </button>
        </div>
      </div>

      {save.isError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {(save.error as Error).message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Login date</p>
          <p className="mt-0.5 text-[13px] text-ink">{formatDate(app.bankLoginAt) || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
            Bank application ID
          </p>
          <p className="mt-0.5 text-[13px] text-ink">{app.bankReferenceNo || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Login fees</p>
          <p className="mt-0.5 text-[13px] text-ink">
            {app.loginFees ? formatAmount(app.loginFees) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Banker</p>
          <p className="mt-0.5 text-[13px] text-ink">
            {[app.bankerName, app.bankerMobile].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Channel</p>
          <p className="mt-0.5 text-[13px] text-ink">{app.dsaChannel || "—"}</p>
        </div>
      </div>

      {editing && (
        <Modal
          title="Update Login Status"
          subtitle={`${app.applicationNo} · ${formatAmount(app.requestedAmount)}`}
          onClose={() => setEditing(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              save.mutate({
                bankReferenceNo: (f.get("bankReferenceNo") as string) || undefined,
                bankLoginAt: f.get("bankLoginAt")
                  ? new Date(f.get("bankLoginAt") as string).toISOString()
                  : undefined,
                loginFees: f.get("loginFees") ? Number(f.get("loginFees")) : undefined,
                bankerName: (f.get("bankerName") as string) || undefined,
                bankerMobile: (f.get("bankerMobile") as string) || undefined,
                dsaChannel: (f.get("dsaChannel") as string) || undefined,
              });
            }}
            className="grid gap-2.5 sm:grid-cols-2"
          >
            <input
              name="bankReferenceNo"
              defaultValue={app.bankReferenceNo ?? ""}
              placeholder="Bank application ID"
              className="field"
            />
            <DatePicker name="bankLoginAt" defaultValue={app.bankLoginAt?.slice(0, 10) ?? ""} placeholder="Login date" />
            <input name="bankerName" defaultValue={app.bankerName ?? ""} placeholder="Banker name" className="field" />
            <input
              name="bankerMobile"
              defaultValue={app.bankerMobile ?? ""}
              placeholder="Banker mobile"
              className="field"
            />
            <input
              name="loginFees"
              type="number"
              step="0.01"
              defaultValue={app.loginFees ?? ""}
              placeholder="Login fees"
              className="field"
            />
            <input
              name="dsaChannel"
              defaultValue={app.dsaChannel ?? ""}
              placeholder="Channel (e.g. Direct)"
              list="dsa-channels"
              className="field"
            />
            <datalist id="dsa-channels">
              {DSA_CHANNELS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            <div className="mt-3 flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={save.isPending} className="btn-primary">
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
