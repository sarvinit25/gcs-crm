import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { formatAmount, formatDate, humanize } from "../lib/format";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  CONSTITUTION_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  type ApplicantConstitution,
  type ApplicationDetail,
  type ApplicationStatus,
  type EmploymentType,
  type Lender,
} from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { ApplicationStatusBadge } from "../components/status-badge";
import { SanctionPanel } from "../components/sanction-panel";
import { EducationLoanDetailPanel } from "../components/education-loan-detail-panel";
import { LoginStatusPanel } from "../components/login-status-panel";
import { BorrowerPortalPanel } from "../components/borrower-portal-panel";
import { CustomerFormPanel } from "../components/customer-form-panel";
import { DocumentsPanel } from "../components/documents-panel";
import { DisbursementPanel } from "../components/disbursement-panel";
import { ChecklistPanel } from "../components/checklist-panel";
import { ArchiveButton } from "../components/archive-button";

const EMPLOYMENT_TYPES = Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[];
const CONSTITUTIONS = Object.keys(CONSTITUTION_LABEL) as ApplicantConstitution[];

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
  const [editingApplicantId, setEditingApplicantId] = useState<string | null>(null);

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

  const updateApplicant = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/applications/${applicationId}/applicants/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setEditingApplicantId(null);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["checklist", applicationId] });
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
  const mutationError = [patch, addApplicant, updateApplicant, addReference].find(
    (m) => m.isError,
  )?.error;

  return (
    <>
      <PageHeader
        title={app.applicationNo}
        subtitle={`${primary?.name ?? "No applicant"} · raised ${formatDate(app.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <ArchiveButton
              kind="applications"
              id={app.id}
              archived={app.archivedAt !== null}
              closed={["DISBURSED", "REJECTED", "WITHDRAWN"].includes(app.status)}
              refresh={[["application", applicationId], ["applications"]]}
            />
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
              </div>
            </section>

            <div id="login"><LoginStatusPanel applicationId={applicationId} /></div>

            <div id="customer-form"><CustomerFormPanel applicationId={applicationId} /></div>

            <div id="portal"><BorrowerPortalPanel applicationId={applicationId} /></div>

            <div id="sanction"><SanctionPanel applicationId={applicationId} /></div>

            {app.loanProduct?.slug === "education-loan" && (
              <EducationLoanDetailPanel applicationId={applicationId} />
            )}

            <div id="disbursement"><DisbursementPanel applicationId={applicationId} /></div>

            <section id="applicants" className="card p-5">
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
                      employmentType: f.get("employmentType") || undefined,
                      constitution: f.get("constitution") || undefined,
                      isNRI: f.get("isNRI") === "on",
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
                  <select name="employmentType" defaultValue="" className="field">
                    <option value="">Employment type</option>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {EMPLOYMENT_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <select name="constitution" defaultValue="" className="field">
                    <option value="">Business constitution (if self-employed)</option>
                    {CONSTITUTIONS.map((c) => (
                      <option key={c} value={c}>
                        {CONSTITUTION_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-[13px] text-muted">
                    <input name="isNRI" type="checkbox" className="h-4 w-4" />
                    NRI
                  </label>
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
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setEditingApplicantId(editingApplicantId === a!.id ? null : a!.id)
                          }
                          className="rounded p-1 text-muted transition hover:bg-bg-light hover:text-navy"
                          title="Edit profile"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
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
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
                      {a!.monthlyIncome && <span>Income {formatAmount(a!.monthlyIncome)}/mo</span>}
                      {a!.cibilScore && <span>CIBIL {a!.cibilScore}</span>}
                      <Link to="/cibil" search={{ q: app.applicationNo } as never} className="font-semibold text-navy underline-offset-2 hover:underline">
                        {a!.cibilScore ? "CIBIL details" : "Check CIBIL"}
                      </Link>
                      {a!.employerName && <span>{a!.employerName}</span>}
                      {a!.employmentType && <span>{EMPLOYMENT_TYPE_LABEL[a!.employmentType]}</span>}
                      {a!.constitution && <span>{CONSTITUTION_LABEL[a!.constitution]}</span>}
                      {a!.isNRI && <span className="font-semibold text-gold-dark">NRI</span>}
                    </div>

                    {editingApplicantId === a!.id && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          updateApplicant.mutate({
                            id: a!.id,
                            employmentType: f.get("employmentType") || undefined,
                            constitution: f.get("constitution") || undefined,
                            isNRI: f.get("isNRI") === "on",
                          });
                        }}
                        className="mt-3 grid gap-2 rounded-lg bg-bg-light p-3 sm:grid-cols-3"
                      >
                        <select
                          name="employmentType"
                          defaultValue={a!.employmentType ?? ""}
                          className="field"
                        >
                          <option value="">Employment type</option>
                          {EMPLOYMENT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {EMPLOYMENT_TYPE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                        <select
                          name="constitution"
                          defaultValue={a!.constitution ?? ""}
                          className="field"
                        >
                          <option value="">Business constitution (if self-employed)</option>
                          {CONSTITUTIONS.map((c) => (
                            <option key={c} value={c}>
                              {CONSTITUTION_LABEL[c]}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-2 text-[13px] text-muted">
                          <input
                            name="isNRI"
                            type="checkbox"
                            defaultChecked={a!.isNRI}
                            className="h-4 w-4"
                          />
                          NRI
                        </label>
                        <button
                          type="submit"
                          disabled={updateApplicant.isPending}
                          className="btn-primary sm:col-span-3"
                        >
                          {updateApplicant.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          Save profile
                        </button>
                      </form>
                    )}
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
                  <span className="text-muted"> · {humanize(app.lead.source)}</span>
                </p>
              ) : (
                <p className="mt-2 text-[13px] text-muted">Raised directly, not from a lead.</p>
              )}
            </section>

            <div id="checklist"><ChecklistPanel applicationId={applicationId} /></div>

            <div id="documents"><DocumentsPanel applicationId={applicationId} /></div>

            <section id="references" className="card p-5">
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
