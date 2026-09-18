import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { formatAmount, formatDate } from "../lib/format";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  type ApplicationDetail,
  type ApplicationStatus,
  type Lender,
} from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { ApplicationStatusBadge } from "../components/status-badge";
import { SanctionPanel } from "../components/sanction-panel";
import { DocumentsPanel } from "../components/documents-panel";
import { DisbursementPanel } from "../components/disbursement-panel";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-0.5 text-[13px] text-ink">{value || "—"}</p>
    </div>
  );
}

export function ApplicationDetailPage() {
  const { applicationId } = useParams({ strict: false }) as { applicationId: string };
  const queryClient = useQueryClient();
  const [showApplicant, setShowApplicant] = useState(false);
  const [showReference, setShowReference] = useState(false);

  const query = useQuery({
    queryKey: ["application", applicationId],
    queryFn: () => api<ApplicationDetail>(`/applications/${applicationId}`),
  });

  const lenders = useQuery({ queryKey: ["lenders"], queryFn: () => api<Lender[]>("/lenders") });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/applications/${applicationId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const addApplicant = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/applications/${applicationId}/applicants`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setShowApplicant(false);
      invalidate();
    },
  });

  const removeApplicant = useMutation({
    mutationFn: (id: string) =>
      api(`/applications/${applicationId}/applicants/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const addReference = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/applications/${applicationId}/references`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setShowReference(false);
      invalidate();
    },
  });

  const removeReference = useMutation({
    mutationFn: (id: string) =>
      api(`/applications/${applicationId}/references/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="py-24 text-center text-sm text-red-600">{(query.error as Error).message}</p>
    );
  }

  const app = query.data;
  const primary = app.applicants.find((a) => a.isPrimary);
  const coApplicants = app.applicants.filter((a) => !a.isPrimary);
  const mutationError = [patch, addApplicant, addReference].find((m) => m.isError)?.error;

  return (
    <>
      <PageHeader
        title={app.applicationNo}
        subtitle={`${primary?.name ?? "No applicant"} · raised ${formatDate(app.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={app.status}
              disabled={patch.isPending}
              onChange={(e) => patch.mutate({ status: e.target.value as ApplicationStatus })}
              className="field w-44"
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {APPLICATION_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <Link to="/applications" className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> All applications
            </Link>
          </div>
        }
      />

      <div className="px-6 py-5">
        {mutationError && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {(mutationError as Error).message}
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <section className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-navy">Loan</h2>
                <ApplicationStatusBadge status={app.status} />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Field label="Product" value={app.loanProduct?.name} />
                <Field label="Requested" value={formatAmount(app.requestedAmount)} />
                <Field
                  label="Tenure"
                  value={app.tenureMonths ? `${app.tenureMonths} months` : null}
                />
                <Field label="Owner" value={app.owner?.name} />
                <Field label="Bank login" value={formatDate(app.bankLoginAt)} />
                <Field label="Bank ref" value={app.bankReferenceNo} />
              </div>
              {app.purpose && (
                <p className="mt-5 rounded-md bg-bg-light px-3 py-2.5 text-[13px] text-muted">
                  {app.purpose}
                </p>
              )}

              <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                  Lender
                  <select
                    value={app.lender?.id ?? ""}
                    disabled={patch.isPending}
                    onChange={(e) => patch.mutate({ lenderId: e.target.value || undefined })}
                    className="field mt-1.5 font-normal tracking-normal normal-case"
                  >
                    <option value="">Not assigned</option>
                    {lenders.data?.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.type})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                  Bank login date
                  <input
                    type="date"
                    defaultValue={app.bankLoginAt?.slice(0, 10) ?? ""}
                    onBlur={(e) =>
                      e.target.value &&
                      patch.mutate({ bankLoginAt: new Date(e.target.value).toISOString() })
                    }
                    className="field mt-1.5 font-normal tracking-normal normal-case"
                  />
                </label>
              </div>
            </section>

            <SanctionPanel applicationId={applicationId} />

            <DisbursementPanel applicationId={applicationId} />

            <section className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold text-navy">
                  Applicants <span className="text-muted">({app.applicants.length})</span>
                </h2>
                <button onClick={() => setShowApplicant(!showApplicant)} className="btn-ghost">
                  <UserPlus className="h-4 w-4" /> Co-applicant
                </button>
              </div>

              {showApplicant && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    addApplicant.mutate({
                      name: f.get("name"),
                      relation: f.get("relation") || undefined,
                      phone: f.get("phone") || undefined,
                      pan: (f.get("pan") as string)?.toUpperCase() || undefined,
                      monthlyIncome: f.get("monthlyIncome")
                        ? Number(f.get("monthlyIncome"))
                        : undefined,
                      cibilScore: f.get("cibilScore") ? Number(f.get("cibilScore")) : undefined,
                    });
                  }}
                  className="mb-4 grid gap-2 rounded-lg bg-bg-light p-3 sm:grid-cols-3"
                >
                  <input name="name" required placeholder="Full name" className="field" />
                  <input name="relation" placeholder="Relation" className="field" />
                  <input name="phone" placeholder="10-digit phone" className="field" />
                  <input name="pan" placeholder="PAN" className="field uppercase" />
                  <input
                    name="monthlyIncome"
                    type="number"
                    placeholder="Monthly income"
                    className="field"
                  />
                  <input name="cibilScore" type="number" placeholder="CIBIL" className="field" />
                  <button
                    type="submit"
                    disabled={addApplicant.isPending}
                    className="btn-primary sm:col-span-3"
                  >
                    {addApplicant.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add co-applicant
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {[primary, ...coApplicants].filter(Boolean).map((a) => (
                  <div key={a!.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-navy">
                          {a!.name}
                          <span className="ml-2 text-[11px] font-bold text-gold-dark">
                            {a!.isPrimary ? "PRIMARY" : (a!.relation ?? "CO-APPLICANT")}
                          </span>
                        </p>
                        <p className="text-[12px] text-muted">
                          {[a!.phone, a!.pan, a!.city].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      {!a!.isPrimary && (
                        <button
                          onClick={() => removeApplicant.mutate(a!.id)}
                          className="rounded p-1 text-muted transition hover:bg-red-50 hover:text-red-600"
                          title="Remove co-applicant"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
                      {a!.monthlyIncome && <span>Income {formatAmount(a!.monthlyIncome)}/mo</span>}
                      {a!.cibilScore && <span>CIBIL {a!.cibilScore}</span>}
                      {a!.employerName && <span>{a!.employerName}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="card p-5">
              <h2 className="text-sm font-bold text-navy">Origin</h2>
              {app.lead ? (
                <p className="mt-2 text-[13px]">
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: app.lead.id }}
                    className="font-semibold text-navy hover:text-gold-dark"
                  >
                    Lead #{app.lead.leadNo}
                  </Link>
                  <span className="text-muted"> · {app.lead.source}</span>
                </p>
              ) : (
                <p className="mt-2 text-[13px] text-muted">Raised directly, not from a lead.</p>
              )}
            </section>

            <DocumentsPanel applicationId={applicationId} />

            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-navy">
                  References <span className="text-muted">({app.references.length})</span>
                </h2>
                <button onClick={() => setShowReference(!showReference)} className="btn-ghost">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>

              {showReference && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    addReference.mutate({
                      name: f.get("name"),
                      phone: f.get("phone"),
                      relation: f.get("relation") || undefined,
                    });
                  }}
                  className="mb-3 grid gap-2 rounded-lg bg-bg-light p-3"
                >
                  <input name="name" required placeholder="Name" className="field" />
                  <input name="phone" required placeholder="10-digit phone" className="field" />
                  <input name="relation" placeholder="Relation" className="field" />
                  <button type="submit" disabled={addReference.isPending} className="btn-primary">
                    {addReference.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add reference
                  </button>
                </form>
              )}

              <ul className="space-y-2">
                {!app.references.length && (
                  <li className="text-[13px] text-muted">No references captured.</li>
                )}
                {app.references.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-2 border-l-2 border-gold/40 pl-3"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-ink">{r.name}</p>
                      <p className="text-[12px] text-muted">
                        {r.phone}
                        {r.relation && ` · ${r.relation}`}
                      </p>
                    </div>
                    <button
                      onClick={() => removeReference.mutate(r.id)}
                      className="rounded p-1 text-muted transition hover:bg-red-50 hover:text-red-600"
                      title="Remove reference"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
