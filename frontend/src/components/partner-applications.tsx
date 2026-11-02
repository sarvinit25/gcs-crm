import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, PhoneCall, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

type Application = {
  id: string;
  applicationNo: number;
  kind: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  organisation: string | null;
  volume: string | null;
  message: string | null;
  status: "NEW" | "CONTACTED" | "APPROVED" | "REJECTED";
  createdAt: string;
  lead: { id: string; leadNo: number } | null;
  partner: { id: string; name: string; code: string | null } | null;
};

const KIND: Record<string, string> = { agent: "Agent", builder: "Builder", freelancer: "Freelancer" };
const STATUS_STYLE: Record<Application["status"], string> = {
  NEW: "bg-amber-50 text-amber-800",
  CONTACTED: "bg-blue-50 text-blue-800",
  APPROVED: "bg-green-50 text-green-800",
  REJECTED: "bg-red-50 text-red-700",
};

/** People who asked to become a partner on the website, to call, approve onto the roster, or turn down. */
export function PartnerApplications() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"open" | "ALL">("open");
  const [approving, setApproving] = useState<string | null>(null);
  const [rate, setRate] = useState("");

  const query = useQuery({
    queryKey: ["partner-applications"],
    queryFn: () => api<Application[]>("/partners/applications"),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["partner-applications"] });
    void queryClient.invalidateQueries({ queryKey: ["partners"] });
  };

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "CONTACTED" | "REJECTED" }) =>
      api(`/partners/applications/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: refresh,
  });

  const approve = useMutation({
    mutationFn: ({ id, commissionRate }: { id: string; commissionRate: number }) =>
      api(`/partners/applications/${id}/approve`, { method: "POST", body: JSON.stringify({ commissionRate }) }),
    onSuccess: () => {
      setApproving(null);
      setRate("");
      refresh();
    },
  });

  const all = query.data ?? [];
  const rows = filter === "open" ? all.filter((a) => a.status === "NEW" || a.status === "CONTACTED") : all;
  const waiting = all.filter((a) => a.status === "NEW").length;
  const error = [setStatus, approve].find((m) => m.isError)?.error as Error | undefined;

  return (
    <section className="card mb-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-bold text-navy">Website sign-ups</h2>
          <p className="text-[12px] text-muted">
            People who filled the Agent, Builder or Freelancer form.{waiting > 0 && ` ${waiting} new.`}
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "open" | "ALL")}
          className="field w-auto py-1.5 text-[13px]"
          aria-label="Which sign-ups to show"
        >
          <option value="open">Waiting for a decision</option>
          <option value="ALL">All sign-ups</option>
        </select>
      </div>

      {error && <p className="bg-red-50 px-5 py-2 text-[13px] text-red-700">{error.message}</p>}

      {query.isPending ? (
        <p className="px-5 py-6 text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No sign-ups waiting.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-[13px]">
              <div className="min-w-0">
                <p className="font-semibold text-navy">
                  {a.name}{" "}
                  <span className="font-normal text-muted">
                    · {KIND[a.kind] ?? a.kind}
                    {a.organisation ? ` · ${a.organisation}` : ""}
                  </span>
                </p>
                <p className="text-muted">
                  {a.phone}
                  {a.city ? ` · ${a.city}` : ""}
                  {a.email ? ` · ${a.email}` : ""}
                  {a.volume ? ` · refers ${a.volume} a month` : ""}
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {a.lead ? ` · lead #${a.lead.leadNo}` : ""}
                  {a.partner ? ` · partner ${a.partner.code ?? a.partner.name}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATUS_STYLE[a.status])}>
                  {a.status === "NEW" ? "New" : a.status === "CONTACTED" ? "Contacted" : a.status === "APPROVED" ? "Approved" : "Rejected"}
                </span>
                {(a.status === "NEW" || a.status === "CONTACTED") &&
                  (approving === a.id ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        placeholder="Commission %"
                        className="field w-28 py-1 text-[13px]"
                        aria-label="Commission rate in percent"
                      />
                      <button
                        className="btn-primary px-2.5 py-1 text-[12px]"
                        disabled={rate === "" || approve.isPending}
                        onClick={() => approve.mutate({ id: a.id, commissionRate: Number(rate) })}
                      >
                        {approve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add partner"}
                      </button>
                      <button className="btn-ghost px-2 py-1 text-[12px]" onClick={() => setApproving(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <>
                      {a.status === "NEW" && (
                        <button
                          className="btn-ghost px-2.5 py-1 text-[12px]"
                          onClick={() => setStatus.mutate({ id: a.id, status: "CONTACTED" })}
                        >
                          <PhoneCall className="h-3.5 w-3.5" /> Contacted
                        </button>
                      )}
                      <button className="btn-primary px-2.5 py-1 text-[12px]" onClick={() => setApproving(a.id)}>
                        <Check className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button
                        className="btn-ghost px-2.5 py-1 text-[12px]"
                        onClick={() => setStatus.mutate({ id: a.id, status: "REJECTED" })}
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    </>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
