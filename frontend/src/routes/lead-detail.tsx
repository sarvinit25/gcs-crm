import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Pencil, Plus } from "lucide-react";
import { api } from "../lib/api";
import { SmartMatchPanel } from "../components/smart-match-panel";
import { formatAmount, formatCompact, formatDate, formatDateTime, humanize } from "../lib/format";
import {
  DOCUMENTS_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  LEAD_SEGMENTS,
  LEAD_SEGMENT_HINT,
  LEAD_SEGMENT_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  LOST_REASONS,
  type DocumentsStatus,
  type EmploymentType,
  type LeadDetail,
    type LeadStatus,
} from "../lib/types";

import { PageHeader } from "../components/app-shell";
import { LeadStatusBadge, SegmentBadge } from "../components/status-badge";
import { NewApplicationWizard } from "../components/new-application-wizard";
import { ChannelInput } from "../components/channel-field";
import { Modal } from "../components/modal";
import { todayIST } from "../lib/date";
import { DatePicker } from "../components/date-picker";
import { ArchiveButton, ArchivedBadge } from "../components/archive-button";

type AssignablePartner = { id: string; name: string; firm: string | null; commissionRate: string };
type AssignableUser = { id: string; name: string; role: string };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-0.5 text-[13px] break-words text-ink">{value ?? "—"}</p>
    </div>
  );
}

type ProductOption = { id: string; name: string };

const BLOCK = "grid content-start gap-1 text-[12px] font-semibold text-navy";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sm:col-span-6">
      <p className="mb-2 border-t border-line pt-3 text-[11px] font-bold tracking-wide text-muted uppercase">{title}</p>
      <div className="grid gap-3 sm:grid-cols-6">{children}</div>
    </section>
  );
}

/** Everything a lender asks before a meeting: the loan, the person, their work and where they live. */
function DetailsModal({ lead, onClose, onSaved }: { lead: LeadDetail; onClose: () => void; onSaved: () => void }) {
  const products = useQuery({ queryKey: ["loan-products"], queryFn: () => api<ProductOption[]>("/loan-products") });
  const [amount, setAmount] = useState(lead.amount ? String(Number(lead.amount)) : "");
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: onSaved,
  });
  return (
    <Modal title="Lead details" subtitle="The more that is filled in, the higher this lead ranks" onClose={onClose} maxWidth="max-w-3xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const text = (k: string) => ((f.get(k) as string) ?? "").trim();
          const num = (k: string) => (text(k) ? Number(text(k)) : null);
          // An emptied box goes as null, which clears what was there.
          save.mutate({
            name: text("name"),
            phone: text("phone"),
            email: text("email"),
            secondaryPhone: text("secondaryPhone") || null,
            loanProductId: text("loanProductId") || undefined,
            amount: num("amount"),
            dateOfBirth: text("dateOfBirth") || null,
            pan: text("pan") || null,
            employmentType: text("employmentType") || null,
            employerName: text("employerName") || null,
            designation: text("designation") || null,
            experienceYears: num("experienceYears"),
            monthlyIncome: num("monthlyIncome"),
            workLocation: text("workLocation") || null,
            officialEmail: text("officialEmail") || null,
            address: text("address") || null,
            city: text("city"),
            pincode: text("pincode") || null,
            notes: text("notes"),
          });
        }}
        className="grid gap-3 sm:grid-cols-6"
      >
        {save.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:col-span-6">{(save.error as Error).message}</p>
        )}

        <Section title="Loan requirement">
          <label className={`${BLOCK} sm:col-span-3`}>
            Loan type
            <select name="loanProductId" defaultValue={lead.loanProduct?.id ?? ""} className="field font-normal">
              <option value="">-- Select loan type --</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`${BLOCK} sm:col-span-3`}>
            Loan amount (₹)
            <input name="amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter loan amount" className="field font-normal" />
            {amount && Number(amount) > 0 && <span className="text-[11px] font-normal text-muted">{formatCompact(amount)}</span>}
          </label>
        </Section>

        <Section title="Contact details">
          <label className={`${BLOCK} sm:col-span-3`}>
            <span>
              Contact person name <span className="text-red-600">*</span>
            </span>
            <input name="name" required minLength={2} maxLength={120} defaultValue={lead.name} className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-3`}>
            Email
            <input name="email" type="email" defaultValue={lead.email ?? ""} placeholder="Enter email address" className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-3`}>
            <span>
              Phone <span className="text-red-600">*</span>
            </span>
            <input name="phone" required inputMode="numeric" pattern="[6-9][0-9]{9}" title="10-digit mobile number" defaultValue={lead.phone} className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-3`}>
            Secondary phone
            <input name="secondaryPhone" inputMode="numeric" pattern="[6-9][0-9]{9}" title="10-digit mobile number" defaultValue={lead.secondaryPhone ?? ""} placeholder="Optional" className="field font-normal" />
          </label>
        </Section>

        <Section title="Applicant details">
          <label className={`${BLOCK} sm:col-span-3`}>
            Date of birth
            <DatePicker name="dateOfBirth" defaultValue={lead.dateOfBirth?.slice(0, 10)} max={todayIST()} minYear={1930} maxYear={Number(todayIST().slice(0, 4))} placeholder="Pick a date" />
          </label>
          <label className={`${BLOCK} sm:col-span-3`}>
            PAN number
            <input name="pan" maxLength={10} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" title="Like ABCDE1234F" defaultValue={lead.pan ?? ""} placeholder="ABCDE1234F" className="field font-mono font-normal uppercase" />
          </label>
        </Section>

        <Section title="Employment details">
          <label className={`${BLOCK} sm:col-span-2`}>
            Employment type
            <select name="employmentType" defaultValue={lead.employmentType ?? ""} className="field font-normal">
              <option value="">Not known</option>
              {(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((k) => (
                <option key={k} value={k}>
                  {EMPLOYMENT_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className={`${BLOCK} sm:col-span-2`}>
            Company / business name
            <input name="employerName" maxLength={160} defaultValue={lead.employerName ?? ""} placeholder="Current employer name" className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-2`}>
            Designation
            <input name="designation" maxLength={120} defaultValue={lead.designation ?? ""} placeholder="Job title" className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-2`}>
            Experience (years)
            <input name="experienceYears" type="number" min={0} max={60} step="0.5" defaultValue={lead.experienceYears ? Number(lead.experienceYears) : ""} placeholder="Years" className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-2`}>
            Monthly income (₹)
            <input name="monthlyIncome" type="number" min={0} defaultValue={lead.monthlyIncome ? Number(lead.monthlyIncome) : ""} placeholder="Net monthly income" className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-2`}>
            Work location
            <input name="workLocation" maxLength={120} defaultValue={lead.workLocation ?? ""} placeholder="Office city" className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-6`}>
            Official email
            <input name="officialEmail" type="email" defaultValue={lead.officialEmail ?? ""} placeholder="work@company.com" className="field font-normal" />
          </label>
        </Section>

        <Section title="Address">
          <label className={`${BLOCK} sm:col-span-6`}>
            Address
            <input name="address" maxLength={300} defaultValue={lead.address ?? ""} placeholder="House / building, street, area" className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-3`}>
            City
            <input name="city" maxLength={80} defaultValue={lead.city ?? ""} className="field font-normal" />
          </label>
          <label className={`${BLOCK} sm:col-span-3`}>
            Pincode
            <input name="pincode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} title="6 digits" defaultValue={lead.pincode ?? ""} className="field font-normal" />
          </label>
        </Section>

        <Section title="Notes">
          <label className={`${BLOCK} sm:col-span-6`}>
            Notes
            <textarea name="notes" rows={3} maxLength={4000} defaultValue={lead.notes ?? ""} placeholder="Add any additional notes…" className="field font-normal" />
          </label>
        </Section>

        <div className="flex justify-end gap-2 sm:col-span-6">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Update lead
          </button>
        </div>
      </form>
    </Modal>
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
  const [editing, setEditing] = useState(false);

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
            <ArchiveButton
              kind="leads"
              id={lead.id}
              archived={lead.archivedAt !== null}
              closed={lead.status === "CONVERTED" || lead.status === "LOST"}
              refresh={[["lead", leadId], ["leads"]]}
            />
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

      {editing && (
        <DetailsModal
          lead={lead}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            invalidate();
          }}
        />
      )}

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

      <div className="grid gap-5 px-6 py-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-5">
          {lead.segment !== null && (
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold text-navy">Priority</h2>
                  <SegmentBadge segment={lead.segment} note={lead.segmentNote} />
                  {lead.segmentLocked && <span className="text-[11px] font-semibold text-muted">Set by hand</span>}
                </div>
                <label className="flex items-center gap-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                  Move to
                  <select
                    value={lead.segmentLocked ? lead.segment : "AUTO"}
                    onChange={(e) => assign.mutate({ segment: e.target.value })}
                    className="field w-36 font-normal tracking-normal normal-case"
                  >
                    <option value="AUTO">Automatic</option>
                    {LEAD_SEGMENTS.map((k) => (
                      <option key={k} value={k}>
                        {LEAD_SEGMENT_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-[13px] text-muted">{lead.segmentNote ?? LEAD_SEGMENT_HINT[lead.segment]}</p>
              {lead.segment !== "HOT" && lead.missingForMeeting.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold tracking-wide text-muted uppercase">To be meeting-ready</span>
                  {lead.missingForMeeting.map((m) => (
                    <span key={m} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      {m}
                    </span>
                  ))}
                  <button onClick={() => setEditing(true)} className="text-[12px] font-semibold text-navy underline hover:text-gold-dark">
                    Fill in
                  </button>
                </div>
              )}
              <label className="mt-4 block text-[11px] font-bold tracking-wide text-muted uppercase sm:w-64">
                Documents from the customer
                <select
                  value={lead.documentsStatus}
                  onChange={(e) => assign.mutate({ documentsStatus: e.target.value as DocumentsStatus })}
                  className="field mt-1.5 font-normal tracking-normal normal-case"
                >
                  {(Object.keys(DOCUMENTS_STATUS_LABEL) as DocumentsStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {DOCUMENTS_STATUS_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-navy">Enquiry</h2>
              <span className="flex items-center gap-2">
                <button onClick={() => setEditing(true)} className="btn-ghost !px-2 !py-1 text-[12px]">
                  <Pencil className="h-3.5 w-3.5" /> Edit details
                </button>
                <LeadStatusBadge status={lead.status} />
                {lead.archivedAt && <ArchivedBadge />}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field label="Phone" value={lead.phone} />
              <Field label="Email" value={lead.email} />
              <Field label="City" value={lead.city} />
              <Field label="Product" value={lead.loanProduct?.name} />
              <Field label="Amount" value={formatAmount(lead.amount)} />
              <Field label="Source" value={humanize(lead.source)} />
              <Field label="Channel" value={lead.channel ?? "Not tracked"} />
              <Field label="Campaign" value={lead.campaign} />
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
              {/* The details a lender asks for show once they are known, so the card stays short until then. */}
              {lead.secondaryPhone && <Field label="Secondary phone" value={lead.secondaryPhone} />}
              {lead.dateOfBirth && <Field label="Date of birth" value={formatDate(lead.dateOfBirth)} />}
              {lead.pan && <Field label="PAN" value={<span className="font-mono">{lead.pan}</span>} />}
              {lead.employerName && <Field label="Company" value={lead.employerName} />}
              {lead.designation && <Field label="Designation" value={lead.designation} />}
              {lead.experienceYears && <Field label="Experience" value={`${Number(lead.experienceYears)} years`} />}
              {lead.workLocation && <Field label="Work location" value={lead.workLocation} />}
              {lead.officialEmail && <Field label="Official email" value={lead.officialEmail} />}
              {(lead.address || lead.pincode) && (
                <Field label="Address" value={[lead.address, lead.pincode].filter(Boolean).join(" · ")} />
              )}
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Channel
                <ChannelInput
                  id="lead-channels"
                  defaultValue={lead.channel}
                  onCommit={(v) => v !== (lead.channel ?? "") && assign.mutate({ channel: v })}
                  className="field mt-1.5 font-normal tracking-normal normal-case"
                />
              </label>
              <label className="text-[11px] font-bold tracking-wide text-muted uppercase">
                Campaign
                <input
                  defaultValue={lead.campaign ?? ""}
                  maxLength={120}
                  onBlur={(e) => e.target.value.trim() !== (lead.campaign ?? "") && assign.mutate({ campaign: e.target.value.trim() })}
                  className="field mt-1.5 font-normal tracking-normal normal-case"
                />
              </label>
            </div>
            {(lead.utmSource || lead.utmMedium || lead.utmContent || lead.utmTerm || lead.landingPage) && (
              <p className="mt-2 text-[12px] text-muted">
                Arrived via{" "}
                {[
                  lead.utmSource && `source ${lead.utmSource}`,
                  lead.utmMedium && `medium ${lead.utmMedium}`,
                  lead.utmContent && `ad ${lead.utmContent}`,
                  lead.utmTerm && `search “${lead.utmTerm}”`,
                  lead.landingPage && `page ${lead.landingPage}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {lead.notes && (
              <p className="mt-5 rounded-md bg-bg-light px-3 py-2.5 text-[13px] break-words whitespace-pre-wrap text-muted">
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
                  pan: lead.pan ?? undefined,
                  dateOfBirth: lead.dateOfBirth?.slice(0, 10),
                  address: lead.address ?? undefined,
                  pincode: lead.pincode ?? undefined,
                  employmentType: lead.employmentType ?? undefined,
                  employerName: lead.employerName ?? undefined,
                  monthlyIncome: lead.monthlyIncome ? Number(lead.monthlyIncome) : undefined,
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

        <div className="space-y-5">
        <SmartMatchPanel lead={lead} />
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
      </div>
    </>
  );
}
