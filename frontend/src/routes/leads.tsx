import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronDown, Download, Loader2, Plus, Search, Upload } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { downloadReport } from "../lib/download-report";
import { todayIST } from "../lib/date";
import { formatAmount, formatDate, humanize, initials, isOverdue } from "../lib/format";
import { useAuth } from "../lib/auth";
import {
  EMPLOYMENT_TYPE_LABEL,
  LEAD_SEGMENTS,
  LEAD_SEGMENT_HINT,
  LEAD_SEGMENT_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type EmploymentType,
  type Lead,
  type LeadSegment,
  type Paginated,
} from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { LeadStatusBadge, SEGMENT_TONE, SegmentBadge } from "../components/status-badge";
import { ChannelInput, useChannels } from "../components/channel-field";
import { Modal } from "../components/modal";
import { LeadImportModal } from "../components/lead-import-modal";
import { PeriodSelect } from "../components/period-select";
import { DatePicker } from "../components/date-picker";
import { TableSkeleton } from "../components/skeleton";
import { ArchivedBadge } from "../components/archive-button";
import { ContactLinks } from "../components/lender-contacts";

type Partner = { id: string; name: string };
type Duplicate = {
  kind: "lead" | "application";
  id: string;
  title: string;
  status: string;
  owner: string | null;
  createdAt: string;
  archived: boolean;
  canOpen: boolean;
};

type Product = { id: string; name: string; slug: string };
type Assignable = { id: string; name: string };

const LABEL = "grid content-start gap-1 text-[12px] font-semibold text-navy";

function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const products = useQuery({
    queryKey: ["loan-products"],
    queryFn: () => api<Product[]>("/loan-products"),
  });
  const staff = useQuery({
    queryKey: ["team-assignable"],
    queryFn: () => api<Assignable[]>("/team/assignable"),
  });

  const partners = useQuery({
    queryKey: ["partners-assignable"],
    queryFn: () => api<Partner[]>("/partners/assignable"),
  });
  const [reference, setReference] = useState<"self" | "partner">("self");
  const [phone, setPhone] = useState("");
  const digits = phone.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  const duplicates = useQuery({
    queryKey: ["lead-duplicates", digits],
    queryFn: () => api<Duplicate[]>(`/leads/duplicates${qs({ phone: digits })}`),
    enabled: digits.length === 10,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/leads", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onCreated,
  });

  return (
    <Modal title="Quick add lead" subtitle="Name and phone are enough. Add the rest now or later." onClose={onClose} maxWidth="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          create.mutate({
            name: f.get("name"),
            phone: f.get("phone"),
            email: f.get("email") || undefined,
            city: f.get("city") || undefined,
            productSlug: f.get("productSlug") || undefined,
            amount: f.get("amount") ? Number(f.get("amount")) : undefined,
            assignedOfficerId: f.get("assignedOfficerId") || undefined,
            assignedManagerId: f.get("assignedManagerId") || undefined,
            sourcingPartnerId: reference === "partner" ? f.get("sourcingPartnerId") || undefined : undefined,
            employmentType: f.get("employmentType") || undefined,
            monthlyIncome: f.get("monthlyIncome") ? Number(f.get("monthlyIncome")) : undefined,
            meetingMode: f.get("meetingMode") || undefined,
            meetingPlace: f.get("meetingPlace") || undefined,
            channel: f.get("channel") || undefined,
            campaign: f.get("campaign") || undefined,
            nextFollowUpAt: f.get("nextFollowUpAt")
              ? new Date(f.get("nextFollowUpAt") as string).toISOString()
              : undefined,
            detail: f.get("detail") || undefined,
            source: "manual-entry",
          });
        }}
        className="grid gap-3"
      >
        {create.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {(create.error as Error).message}
          </p>
        )}

        <label className={LABEL}>
          <span>
            Contact person name <span className="text-red-600">*</span>
          </span>
          <input name="name" required maxLength={120} placeholder="Enter contact person name" className="field font-normal" />
        </label>
        <label className={LABEL}>
          <span>
            Phone <span className="text-red-600">*</span>
          </span>
          <input
            name="phone"
            required
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number"
            className="field font-normal"
          />
        </label>
        {duplicates.data && duplicates.data.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
            <p className="font-semibold">This number is already in the CRM</p>
            <ul className="mt-1 space-y-0.5">
              {duplicates.data.map((d) => (
                <li key={`${d.kind}-${d.id}`}>
                  {d.canOpen ? (
                    <Link
                      to={d.kind === "lead" ? "/leads/$leadId" : "/applications/$applicationId"}
                      params={d.kind === "lead" ? { leadId: d.id } : ({ applicationId: d.id } as never)}
                      className="font-semibold underline"
                    >
                      {d.title}
                    </Link>
                  ) : (
                    <span className="font-semibold">{d.title}</span>
                  )}{" "}
                  · {humanize(d.status)}
                  {d.archived && " · archived"}
                  {d.owner ? ` · with ${d.owner}` : " · unassigned"}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-amber-800/80">You can still create it if this is a genuinely separate enquiry.</p>
          </div>
        )}
        <label className={LABEL}>
          Email
          <input name="email" type="email" placeholder="Enter email address" className="field font-normal" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={LABEL}>
            Loan type
            <select name="productSlug" defaultValue="" className="field font-normal">
              <option value="">-- Select loan type --</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Loan amount
            <input name="amount" type="number" min={0} placeholder="Enter loan amount" className="field font-normal" />
          </label>
        </div>
        <label className={LABEL}>
          Lead source
          <ChannelInput name="channel" id="new-lead-channels" placeholder="Pick or type where this lead came from" className="field font-normal" />
        </label>

        <details className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[13px] font-semibold text-navy">
            More details
            <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t border-line px-3 py-3 sm:grid-cols-2">
            <label className={LABEL}>
              City
              <input name="city" placeholder="City" className="field font-normal" />
            </label>
            <label className={LABEL}>
              Campaign / activity
              <input name="campaign" maxLength={120} placeholder="e.g. Andheri society drive" className="field font-normal" />
            </label>
            <label className={LABEL}>
              Relationship officer
              <select name="assignedOfficerId" defaultValue="" className="field font-normal">
                <option value="">Automatic (set on the Teams page)</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Sales manager
              <select name="assignedManagerId" defaultValue="" className="field font-normal">
                <option value="">None</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Reference type
              <select
                value={reference}
                onChange={(e) => setReference(e.target.value as "self" | "partner")}
                className="field font-normal"
              >
                <option value="self">Self</option>
                <option value="partner">Sourcing partner</option>
              </select>
            </label>
            {reference === "partner" ? (
              <label className={LABEL}>
                Partner
                <select name="sourcingPartnerId" required defaultValue="" className="field font-normal">
                  <option value="" disabled>
                    Select partner
                  </option>
                  {partners.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="hidden sm:block" />
            )}
            <label className={LABEL}>
              Employment type
              <select name="employmentType" defaultValue="" className="field font-normal">
                <option value="">Not known</option>
                {(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((t) => (
                  <option key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Monthly income (₹)
              <input name="monthlyIncome" type="number" min={0} placeholder="e.g. 50000" className="field font-normal" />
            </label>
            <label className={LABEL}>
              Next meeting / follow-up
              <DatePicker name="nextFollowUpAt" min={todayIST()} placeholder="Pick a date" />
            </label>
            <label className={LABEL}>
              Meeting mode
              <select name="meetingMode" defaultValue="" className="field font-normal">
                <option value="">Not set</option>
                <option value="In-person">In-person</option>
                <option value="Phone">Phone</option>
                <option value="Video">Video</option>
              </select>
            </label>
            <label className={`${LABEL} sm:col-span-2`}>
              Place of contact
              <input name="meetingPlace" placeholder="Place of contact" className="field font-normal" />
            </label>
            <label className={`${LABEL} sm:col-span-2`}>
              Notes
              <textarea name="detail" placeholder="Notes (optional)" className="field min-h-[70px] resize-none font-normal" />
            </label>
          </div>
        </details>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={create.isPending} className="btn-primary">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create lead
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** "today", "yesterday", "3 days ago" — how long since the last call or note. */
function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : formatDate(iso);
}

export function LeadsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Advisors only ever see their own leads, so choosing an owner would mean nothing to them.
  const canFilterOwner = user?.role !== "ADVISOR";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [segment, setSegment] = useState<LeadSegment | "">("");
  const [chatbot, setChatbot] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [loanProductId, setLoanProductId] = useState("");
  const [channel, setChannel] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const channels = useChannels();
  const [timeRange, setTimeRange] = useState("all");
  const [page, setPage] = useState(1);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [archived, setArchived] = useState(false);

  const products = useQuery({
    queryKey: ["loan-products"],
    queryFn: () => api<Product[]>("/loan-products"),
  });

  const staff = useQuery({
    queryKey: ["team-assignable"],
    queryFn: () => api<Assignable[]>("/team/assignable"),
    enabled: canFilterOwner,
  });
  const partners = useQuery({
    queryKey: ["partners-assignable"],
    queryFn: () => api<Partner[]>("/partners/assignable"),
  });
  const typeCounts = useQuery({
    queryKey: ["leads", "loan-types"],
    queryFn: () => api<{ total: number; types: { loanProductId: string; name: string; count: number }[] }>("/leads/loan-types"),
  });

  const counts = useQuery({
    queryKey: ["leads", "segments"],
    queryFn: () => api<Record<LeadSegment, number> & { followUpsDue: number; chatbot: number }>("/leads/segments"),
  });

  const query = useQuery({
    queryKey: ["leads", { search, status, segment, chatbot, dueOnly, loanProductId, channel, ownerId, partnerId, timeRange, page, archived }],
    queryFn: () =>
      api<Paginated<Lead>>(
        `/leads${qs({ search, status, segment, chatbot: chatbot ? "true" : undefined, loanProductId, channel, assignedOfficerId: ownerId, sourcingPartnerId: partnerId, range: timeRange, dueOnly: dueOnly ? "true" : undefined, archived: archived ? "true" : undefined, page })}`,
      ),
  });

  const exportCsv = () => void downloadReport("leads", { q: search, status, loanProductId, range: timeRange });

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={query.data ? `${query.data.total} total` : "Every enquiry, from any source"}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)} className="btn-ghost">
              <Upload className="h-4 w-4" /> Import
            </button>
            <button onClick={exportCsv} className="btn-ghost">
              <Download className="h-4 w-4" /> Export
            </button>
            <button onClick={() => setShowNewLead(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> New Lead
            </button>
          </div>
        }
      />

      {showImport && (
        <LeadImportModal
          onClose={() => setShowImport(false)}
          onDone={() => void queryClient.invalidateQueries({ queryKey: ["leads"] })}
        />
      )}

      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onCreated={() => {
            setShowNewLead(false);
            void queryClient.invalidateQueries({ queryKey: ["leads"] });
          }}
        />
      )}

      <div className="px-6 py-5">
        {/* Loan-type tabs with counts: the busiest few, the rest through the loan-type filter below. */}
        {typeCounts.data && typeCounts.data.types.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Loan type">
            {[{ loanProductId: "", name: "All leads", count: typeCounts.data.total }, ...typeCounts.data.types.slice(0, 6)].map((t) => {
              const on = loanProductId === t.loanProductId;
              return (
                <button
                  key={t.loanProductId || "all"}
                  role="tab"
                  aria-selected={on}
                  onClick={() => reset(() => setLoanProductId(t.loanProductId))}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition",
                    on ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:border-navy/30 hover:text-navy",
                  )}
                >
                  {t.name}
                  <span className={clsx("rounded-full px-1.5 text-[11px] font-bold", on ? "bg-white/20" : "bg-bg-light")}>{t.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* The four working segments, in priority order. Tap one to see only those leads. */}
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <button
            onClick={() => reset(() => setSegment(""))}
            className={clsx(
              "rounded-xl border px-4 py-3 text-left transition-colors",
              segment === "" ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-navy/30",
            )}
          >
            <p className="text-[11px] font-bold tracking-wide uppercase opacity-70">All, by priority</p>
            <p className="mt-0.5 text-xl font-bold">
              {counts.data ? LEAD_SEGMENTS.reduce((n, k) => n + counts.data[k], 0) : "—"}
            </p>
          </button>
          {LEAD_SEGMENTS.map((k) => (
            <button
              key={k}
              onClick={() => reset(() => setSegment(segment === k ? "" : k))}
              title={LEAD_SEGMENT_HINT[k]}
              className={clsx(
                "rounded-xl border px-4 py-3 text-left transition-colors",
                segment === k ? "border-navy ring-2 ring-navy/20" : "border-line hover:border-navy/30",
                "bg-white",
              )}
            >
              <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold", SEGMENT_TONE[k])}>
                {LEAD_SEGMENT_LABEL[k]}
              </span>
              <p className="mt-1 text-xl font-bold text-navy">{counts.data ? counts.data[k] : "—"}</p>
              <p className="text-[11px] leading-snug text-muted">{LEAD_SEGMENT_HINT[k]}</p>
            </button>
          ))}
          {/* People who signed in to the website chat with a mobile code, in any segment. */}
          <button
            onClick={() => reset(() => setChatbot(!chatbot))}
            title="People who confirmed their mobile number with a code to use the website chat"
            className={clsx(
              "rounded-xl border bg-white px-4 py-3 text-left transition-colors",
              chatbot ? "border-navy ring-2 ring-navy/20" : "border-line hover:border-navy/30",
            )}
          >
            <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
              Chatbot contacts
            </span>
            <p className="mt-1 text-xl font-bold text-navy">{counts.data ? counts.data.chatbot : "—"}</p>
            <p className="text-[11px] leading-snug text-muted">Verified by a code in the website chat</p>
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input
              value={search}
              onChange={(e) => reset(() => setSearch(e.target.value))}
              placeholder="Name, phone or email"
              className="field w-64 pl-9"
            />
          </div>

          <select
            value={status}
            onChange={(e) => reset(() => setStatus(e.target.value))}
            className="field w-40"
          >
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <select
            value={loanProductId}
            onChange={(e) => reset(() => setLoanProductId(e.target.value))}
            className="field w-44"
          >
            <option value="">All loan types</option>
            {products.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select value={channel} onChange={(e) => reset(() => setChannel(e.target.value))} className="field w-48" aria-label="Channel">
            <option value="">All channels</option>
            <option value="none">Not tracked</option>
            {(channels.data ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {canFilterOwner && (
            <select value={ownerId} onChange={(e) => reset(() => setOwnerId(e.target.value))} className="field w-44" aria-label="Assigned to">
              <option value="">Assigned to — all</option>
              <option value="none">Unassigned</option>
              {staff.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}

          <select value={partnerId} onChange={(e) => reset(() => setPartnerId(e.target.value))} className="field w-44" aria-label="Sourced by">
            <option value="">Sourced by — all</option>
            <option value="none">Ourselves</option>
            {partners.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <PeriodSelect value={timeRange} onChange={(v) => reset(() => setTimeRange(v))} className="field w-56" />

          <button
            onClick={() => reset(() => setDueOnly(!dueOnly))}
            className={clsx("btn-ghost", dueOnly && "border-navy/40 bg-navy/5")}
          >
            <AlertCircle className="h-4 w-4" />
            Follow-up due
          </button>

          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={archived} onChange={(e) => reset(() => setArchived(e.target.checked))} />
            Archived
          </label>
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">
              {(query.error as Error).message}
            </p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">No leads match these filters.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Lead</th>
                  <th className="px-4 py-2.5 font-bold">Priority</th>
                  <th className="px-4 py-2.5 font-bold">Product</th>
                  <th className="px-4 py-2.5 font-bold">Amount</th>
                  <th className="px-4 py-2.5 font-bold">Reference</th>
                  <th className="px-4 py-2.5 font-bold">Chatbot</th>
                  <th className="px-4 py-2.5 font-bold">Owner</th>
                  <th className="px-4 py-2.5 font-bold">Last contact</th>
                  <th className="px-4 py-2.5 font-bold">Follow-up</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((lead) => (
                  <tr key={lead.id} className="border-b border-line/70 last:border-0 hover:bg-bg-light/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy/10 text-[12px] font-bold text-navy">
                          {initials(lead.name)}
                        </span>
                        <div>
                          <Link
                            to="/leads/$leadId"
                            params={{ leadId: lead.id }}
                            className="font-semibold text-navy hover:text-gold-dark"
                          >
                            {lead.name}
                          </Link>
                          {lead.archivedAt && <ArchivedBadge />}
                          <p className="flex items-center text-[12px] text-muted">
                            <span>
                              #{lead.leadNo} · {lead.phone}
                              {lead.city && ` · ${lead.city}`}
                            </span>
                            <ContactLinks phone={lead.phone} email={lead.email} />
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <SegmentBadge segment={lead.segment} note={lead.segmentNote} />
                      {lead.segmentNote && lead.segment && (
                        <p className="mt-0.5 max-w-[210px] truncate text-[11px] text-muted" title={lead.segmentNote}>
                          {lead.segmentNote}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{lead.loanProduct?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{formatAmount(lead.amount)}</td>
                    <td className="px-4 py-3 text-muted">
                      {lead.sourcingPartner?.name ?? "Self"}
                      <p className="text-[11px]">{humanize(lead.source)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {lead.chatVerifiedAt ? (
                        <>
                          <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                            Verified on chat
                          </span>
                          <p className="mt-0.5 text-[11px] text-muted">{formatDate(lead.chatVerifiedAt)}</p>
                        </>
                      ) : (
                        <span className="text-muted/60">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {lead.assignedOfficer?.name ?? (
                        <span className="text-amber-600">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {lead.lastContactAt ? (
                        <span title={`${lead.contactCount} call${lead.contactCount === 1 ? "" : "s"} or note${lead.contactCount === 1 ? "" : "s"} logged`}>
                          {ago(lead.lastContactAt)}
                        </span>
                      ) : (
                        <span className="text-muted/70">No contact yet</span>
                      )}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-3",
                        isOverdue(lead.nextFollowUpAt) ? "font-semibold text-red-600" : "text-muted",
                      )}
                    >
                      {formatDate(lead.nextFollowUpAt)}
                    </td>
                    <td className="px-4 py-3">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {query.data && query.data.total > query.data.pageSize && (
          <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
            <span>
              Showing {(query.data.page - 1) * query.data.pageSize + 1} to {Math.min(query.data.page * query.data.pageSize, query.data.total)} of {query.data.total} leads
            </span>
            <div className="flex gap-2">
              <button
                className="btn-ghost"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn-ghost"
                disabled={page >= Math.ceil(query.data.total / query.data.pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
