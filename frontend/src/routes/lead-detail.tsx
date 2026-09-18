import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { api } from "../lib/api";
import { formatAmount, formatDate, formatDateTime } from "../lib/format";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadDetail, type LeadStatus } from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { LeadStatusBadge } from "../components/status-badge";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-0.5 text-[13px] text-ink">{value ?? "—"}</p>
    </div>
  );
}

export function LeadDetailPage() {
  // Non-strict: the route sits under an id-based layout route, so its full id isn't "/leads/$leadId".
  const { leadId } = useParams({ strict: false }) as { leadId: string };
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");

  const query = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => api<LeadDetail>(`/leads/${leadId}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const setStatus = useMutation({
    mutationFn: (status: LeadStatus) =>
      api(`/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
  });

  const addFollowUp = useMutation({
    mutationFn: () =>
      api(`/leads/${leadId}/follow-ups`, {
        method: "POST",
        body: JSON.stringify({
          note,
          ...(dueAt && { dueAt: new Date(dueAt).toISOString() }),
        }),
      }),
    onSuccess: () => {
      setNote("");
      setDueAt("");
      invalidate();
    },
  });

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (query.isError) {
    return <p className="py-24 text-center text-sm text-red-600">{(query.error as Error).message}</p>;
  }

  const lead = query.data;

  return (
    <>
      <PageHeader
        title={lead.name}
        subtitle={`Lead #${lead.leadNo} · added ${formatDate(lead.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={lead.status}
              disabled={setStatus.isPending}
              onChange={(e) => setStatus.mutate(e.target.value as LeadStatus)}
              className="field w-44"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <Link to="/leads" className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> All leads
            </Link>
          </div>
        }
      />

      <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-navy">Enquiry</h2>
              <LeadStatusBadge status={lead.status} />
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field label="Phone" value={lead.phone} />
              <Field label="Email" value={lead.email} />
              <Field label="City" value={lead.city} />
              <Field label="Product" value={lead.loanProduct?.name} />
              <Field label="Amount" value={formatAmount(lead.amount)} />
              <Field label="Source" value={lead.source} />
              <Field label="Relationship Officer" value={lead.assignedOfficer?.name} />
              <Field label="Sales Manager" value={lead.assignedManager?.name} />
              <Field label="Sourcing Partner" value={lead.sourcingPartner?.name} />
            </div>
            {lead.notes && (
              <p className="mt-5 rounded-md bg-bg-light px-3 py-2.5 text-[13px] whitespace-pre-wrap text-muted">
                {lead.notes}
              </p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-bold text-navy">Application</h2>
            {lead.application ? (
              <p className="mt-2 text-[13px]">
                <span className="font-semibold text-navy">{lead.application.applicationNo}</span>
                <span className="text-muted"> · {lead.application.status}</span>
              </p>
            ) : (
              <p className="mt-2 text-[13px] text-muted">
                No application raised from this lead yet.
              </p>
            )}
          </section>
        </div>

        <section className="card p-5">
          <h2 className="text-sm font-bold text-navy">Follow-ups</h2>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addFollowUp.mutate();
            }}
            className="mt-3"
          >
            <textarea
              required
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened on this call?"
              className="field resize-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="field flex-1"
                title="Next follow-up"
              />
              <button type="submit" disabled={addFollowUp.isPending} className="btn-primary">
                {addFollowUp.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Log
              </button>
            </div>
          </form>

          <ul className="mt-5 space-y-3">
            {lead.followUps.length === 0 && (
              <li className="text-[13px] text-muted">Nothing logged yet.</li>
            )}
            {lead.followUps.map((f) => (
              <li key={f.id} className="border-l-2 border-gold/40 pl-3">
                <p className="text-[13px] whitespace-pre-wrap text-ink">{f.note}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {f.user.name} · {formatDateTime(f.createdAt)}
                  {f.dueAt && ` · next ${formatDate(f.dueAt)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
