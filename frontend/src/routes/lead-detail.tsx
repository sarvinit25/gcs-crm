import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Plus } from "lucide-react";
import { api } from "../lib/api";
import { formatAmount, formatDate, formatDateTime } from "../lib/format";
import { LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadDetail, type LeadStatus } from "../lib/types";

import { PageHeader } from "../components/app-shell";
import { LeadStatusBadge } from "../components/status-badge";

type Product = { id: string; name: string; slug: string };
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

  const query = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => api<LeadDetail>(`/leads/${leadId}`),
  });

  const products = useQuery({
    queryKey: ["loan-products"],
    queryFn: () => api<Product[]>("/loan-products"),
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

  const setStatus = useMutation({
    mutationFn: (status: LeadStatus) =>
      api(`/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
  });

  const assign = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const raise = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ id: string }>("/applications", {
        method: "POST",
        body: JSON.stringify({ ...body, leadId }),
      }),
    onSuccess: (app) => {
      invalidate();
      void navigate({ to: "/applications/$applicationId", params: { applicationId: app.id } });
    },
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
  const raiseError = raise.isError ? (raise.error as Error).message : null;

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
                <span className="text-muted"> · {lead.application.status}</span>
              </p>
            ) : (
              <>
                <p className="mt-2 text-[13px] text-muted">
                  No application raised from this lead yet. Raising one carries the enquiry over as
                  the primary applicant.
                </p>
                {raiseError && (
                  <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
                    {raiseError}
                  </p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    raise.mutate({
                      loanProductId: f.get("loanProductId") as string,
                      requestedAmount: Number(f.get("requestedAmount")),
                      tenureMonths: f.get("tenureMonths")
                        ? Number(f.get("tenureMonths"))
                        : undefined,
                    });
                  }}
                  className="mt-4 grid gap-2 sm:grid-cols-3"
                >
                  <select
                    name="loanProductId"
                    required
                    defaultValue={lead.loanProduct?.id ?? ""}
                    className="field sm:col-span-3"
                  >
                    <option value="" disabled>
                      Select loan product
                    </option>
                    {products.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    name="requestedAmount"
                    type="number"
                    required
                    min={1}
                    defaultValue={lead.amount ?? undefined}
                    placeholder="Amount"
                    className="field"
                  />
                  <input
                    name="tenureMonths"
                    type="number"
                    min={1}
                    placeholder="Tenure (months)"
                    className="field"
                  />
                  <button type="submit" disabled={raise.isPending} className="btn-primary">
                    {raise.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Raise
                  </button>
                </form>
              </>
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
