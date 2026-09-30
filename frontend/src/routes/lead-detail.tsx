import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Plus } from "lucide-react";
import { api } from "../lib/api";
import { formatAmount, formatDate, formatDateTime, humanize } from "../lib/format";
import {
  EMPLOYMENT_TYPE_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LOST_REASONS,
  type LeadDetail,
  type LeadStatus,
} from "../lib/types";

import { PageHeader } from "../components/app-shell";
import { LeadStatusBadge } from "../components/status-badge";
import { NewApplicationWizard } from "../components/new-application-wizard";
import { Modal } from "../components/modal";
import { todayIST } from "../lib/date";
import { DatePicker } from "../components/date-picker";

type AssignablePartner = { id: string; name: string; firm: string | null; commissionRate: string };
type AssignableUser = { id: string; name: string; role: string };

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
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [showWizard, setShowWizard] = useState(false);

  const query = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => api<LeadDetail>(`/leads/${leadId}`),
  });

  const partners = useQuery({
    queryKey: ["partners-assignable"],
    queryFn: () => api<AssignablePartner[]>("/partners/assignable"),
  });

  const staff = useQuery({
    queryKey: ["team-assignable"],
    queryFn: () => api<AssignableUser[]>("/team/assignable"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const [askingReason, setAskingReason] = useState(false);
  const setStatus = useMutation({
    mutationFn: (body: { status: LeadStatus; lostReason?: string }) =>
      api(`/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setAskingReason(false);
      invalidate();
    },
  });

  const assign = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const addFollowUp = useMutation({
    mutationFn: () =>
      api(`/leads/${leadId}/follow-ups`, {
        method: "POST",
        body: JSON.stringify({
          note,
          ...(dueAt && { dueAt: new Date(`${dueAt}T00:00:00+05:30`).toISOString() }),
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
              onChange={(e) => {
                const next = e.target.value as LeadStatus;
                // Closing a lead out needs a reason, so ask before sending anything.
                if (next === "LOST") setAskingReason(true);
                else setStatus.mutate({ status: next });
              }}
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

      {askingReason && (
        <Modal title="Why was this lead lost?" subtitle="This is kept on the lead and shows in reports" onClose={() => setAskingReason(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const other = (f.get("other") as string).trim();
              const choice = f.get("reason") as string;
              setStatus.mutate({ status: "LOST", lostReason: choice === "Other" && other ? other : choice });
            }}
            className="space-y-3"
          >
            <select name="reason" required defaultValue="" className="field w-full">
              <option value="" disabled>
                Select a reason
              </option>
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input name="other" placeholder="Details (used when reason is Other)" className="field w-full" />
            {setStatus.isError && <p className="text-[13px] text-red-600">{(setStatus.error as Error).message}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={setStatus.isPending} className="btn-primary">
                {setStatus.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark as lost
              </button>
              <button type="button" onClick={() => setAskingReason(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

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
              <Field label="Source" value={humanize(lead.source)} />
              {lead.status === "LOST" && <Field label="Lost because" value={lead.lostReason} />}
              <Field
                label="Employment"
                value={lead.employmentType ? EMPLOYMENT_TYPE_LABEL[lead.employmentType] : null}
              />
              <Field label="Monthly income" value={lead.monthlyIncome ? formatAmount(lead.monthlyIncome) : null} />
              <Field
                label="Meeting"
                value={[lead.meetingMode, lead.meetingPlace].filter(Boolean).join(" · ") || null}
              />
            </div>

            <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Relationship Officer
                <select
                  value={lead.assignedOfficer?.id ?? ""}
                  disabled={setStatus.isPending}
                  onChange={(e) => assign.mutate({ assignedOfficerId: e.target.value || null })}
                  className="field mt-1.5 font-normal tracking-normal normal-case"
                >
                  <option value="">Unassigned</option>
                  {staff.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Sales Manager
                <select
                  value={lead.assignedManager?.id ?? ""}
                  onChange={(e) => assign.mutate({ assignedManagerId: e.target.value || null })}
                  className="field mt-1.5 font-normal tracking-normal normal-case"
                >
                  <option value="">Unassigned</option>
                  {staff.data
                    ?.filter((u) => u.role !== "ADVISOR")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Sourcing Partner
                <select
                  value={lead.sourcingPartner?.id ?? ""}
                  onChange={(e) => assign.mutate({ sourcingPartnerId: e.target.value || null })}
                  className="field mt-1.5 font-normal tracking-normal normal-case"
                >
                  <option value="">Direct — no referrer</option>
                  {partners.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.firm ? ` (${p.firm})` : ""} — {p.commissionRate}%
                    </option>
                  ))}
                </select>
              </label>
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
                <Link
                  to="/applications/$applicationId"
                  params={{ applicationId: lead.application.id }}
                  className="font-semibold text-navy hover:text-gold-dark"
                >
                  {lead.application.applicationNo}
                </Link>
                <span className="text-muted"> · {humanize(lead.application.status)}</span>
              </p>
            ) : (
              <>
                <p className="mt-2 text-[13px] text-muted">
                  No application raised from this lead yet. Raising one carries the enquiry over as
                  the primary applicant.
                </p>
                <button onClick={() => setShowWizard(true)} className="btn-primary mt-4">
                  <FileText className="h-4 w-4" /> Raise Application
                </button>
              </>
            )}

            {showWizard && (
              <NewApplicationWizard
                leadId={leadId}
                prefill={{
                  name: lead.name,
                  phone: lead.phone,
                  email: lead.email ?? undefined,
                  city: lead.city ?? undefined,
                  loanProductId: lead.loanProduct?.id,
                  requestedAmount: lead.amount ?? undefined,
                }}
                onClose={() => setShowWizard(false)}
                onCreated={(applicationId) => {
                  setShowWizard(false);
                  invalidate();
                  void navigate({ to: "/applications/$applicationId", params: { applicationId } });
                }}
              />
            )}
          </section>
        </div>

        <section id="followups" className="card p-5">
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
              <DatePicker
                value={dueAt}
                onChange={setDueAt}
                min={todayIST()}
                className="flex-1"
                title="Next follow-up"
                placeholder="Next follow-up date"
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
