import { useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Archive, ChevronDown, Loader2, Plus, Search, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { ExportMenu } from "../components/export-menu";
import { todayIST } from "../lib/date";
import { formatAmount, formatDate, humanize, initials, isOverdue } from "../lib/format";
import { useAuth } from "../lib/auth";
import {
  EMPLOYMENT_TYPE_LABEL,
  LEAD_SEGMENTS,
  LEAD_SEGMENT_HINT,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type EmploymentType,
  type Lead,
  type LeadSegment,
  type Paginated,
} from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { LeadStatusBadge, SegmentBadge } from "../components/status-badge";
import { PRIORITY_META } from "../lib/priority";
import { ChannelInput, useChannels } from "../components/channel-field";
import { Modal } from "../components/modal";
import { LeadDeleteDialog } from "../components/lead-delete";
import { ArchivedLeads } from "../components/archived-leads";
import { LeadImportModal } from "../components/lead-import-modal";
import { DEFAULT_LEAD_SORT, LEAD_SORTS, sortParam, type LeadSortValue } from "../lib/lead-sort";
import type { LeadLinkFilter } from "../lib/lead-filters";
import { ColumnFilter } from "../components/column-filter";
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
    <Modal title="Quick add lead" subtitle="Step 1: the same short first form as the website. Save it now; add the loan's second form from the lead page later." onClose={onClose} maxWidth="max-w-lg">
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
          City
          <input name="city" placeholder="City" className="field font-normal" />
        </label>
        <label className={LABEL}>
          <span>
            Lead source <span className="text-red-600">*</span>
          </span>
          <ChannelInput name="channel" id="new-lead-channels" defaultValue="Manual entry" required placeholder="Where did this lead come from?" className="field font-normal" />
        </label>

        <details className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[13px] font-semibold text-navy">
            More details
            <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 border-t border-line px-3 py-3 sm:grid-cols-2">
            <label className={LABEL}>
              Email
              <input name="email" type="email" placeholder="Enter email address" className="field font-normal" />
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

/** How a lead got into the CRM, in plain words. */
const ENTRY_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp chat",
  "ai-telecaller": "AI phone call",
  "website-chat": "Website chat",
  "ai-advisor": "Website assistant",
  "manual-entry": "Added by hand",
  "bulk-upload": "Bulk upload",
  "cibil-report-request": "CIBIL request",
  "checklist-download": "Checklist download",
  "partner-enquiry": "Partner enquiry",
  "ca-legal-enquiry": "CA / legal enquiry",
};
const entryLabel = (source: string) => ENTRY_LABEL[source] ?? "Website form";

/** "today", "yesterday", "3 days ago" — how long since the last call or note. */
function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : formatDate(iso);
}

function ActiveLeadsPage({ onOpenArchive }: { onOpenArchive: () => void }) {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<Lead | null>(null);
  const { user } = useAuth();
  // Advisors only ever see their own leads, so choosing an owner would mean nothing to them.
  const canFilterOwner = user?.role !== "ADVISOR";
  // A link (from the Dashboard's charts and tiles, say) can open this page already filtered.
  const link = useSearch({ strict: false }) as LeadLinkFilter;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(link.status ?? "");
  const [segment, setSegment] = useState<LeadSegment | "">((link.segment as LeadSegment | undefined) ?? "");
  const [source, setSource] = useState(link.source ?? "");
  const [chatbot, setChatbot] = useState(false);
  const [dueOnly, setDueOnly] = useState(link.dueOnly === true);
  const [loanProductId, setLoanProductId] = useState("");
  const [channel, setChannel] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [ownerId, setOwnerId] = useState(link.owner ?? "");
  const [partnerId, setPartnerId] = useState("");
  const channels = useChannels();
  const questions = useQuery({
    queryKey: ["lead-answer-questions"],
    queryFn: () => api<{ question: string; count: number }[]>("/leads/answer-questions"),
    staleTime: 60_000,
  });
  const [timeRange, setTimeRange] = useState("all");
  const [sort, setSort] = useState<LeadSortValue>(DEFAULT_LEAD_SORT);
  const [page, setPage] = useState(1);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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
    queryKey: ["leads", { search, status, segment, source, chatbot, dueOnly, loanProductId, channel, question, answer, ownerId, partnerId, timeRange, sort, page }],
    queryFn: () =>
      api<Paginated<Lead>>(
        `/leads${qs({ search, status, segment, source: source || undefined, chatbot: chatbot ? "true" : undefined, loanProductId, channel, question: question || undefined, answer: question ? answer || undefined : undefined, assignedOfficerId: ownerId, sourcingPartnerId: partnerId, range: timeRange, dueOnly: dueOnly ? "true" : undefined, sort: sortParam(sort), page })}`,
      ),
  });

  // The export follows the list: same search, status, segment, loan type, source, owner, partner, period and archive view.
  const exportFilters = { q: search, status, segment, loanProductId, channel, ownerId, partnerId, range: timeRange, archived: "false" };

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  // Each active filter as a removable chip, so it is always clear why the list looks the way it does.
  const nameOf = (list: { id: string; name: string }[] | undefined, id: string, none: string) => (id === "none" ? none : (list?.find((x) => x.id === id)?.name ?? "…"));
  const chips = (
    [
      segment && { key: "segment", label: `Priority: ${PRIORITY_META[segment].label}`, clear: () => setSegment("") },
      loanProductId && { key: "loan", label: `Loan: ${nameOf(products.data, loanProductId, "")}`, clear: () => setLoanProductId("") },
      status && { key: "status", label: `Status: ${LEAD_STATUS_LABEL[status as keyof typeof LEAD_STATUS_LABEL] ?? status}`, clear: () => setStatus("") },
      source && { key: "source", label: `Source: ${entryLabel(source)}`, clear: () => setSource("") },
      ownerId && { key: "owner", label: `Owner: ${nameOf(staff.data, ownerId, "Unassigned")}`, clear: () => setOwnerId("") },
      partnerId && { key: "partner", label: `Sourced by: ${nameOf(partners.data, partnerId, "Ourselves")}`, clear: () => setPartnerId("") },
      channel && { key: "channel", label: `Channel: ${channel === "none" ? "Not tracked" : channel}`, clear: () => setChannel("") },
      question && {
        key: "question",
        label: `Form: ${question}${answer ? ` = ${answer}` : ""}`,
        clear: () => {
          setQuestion("");
          setAnswer("");
        },
      },
      chatbot && { key: "chatbot", label: "Chatbot contacts", clear: () => setChatbot(false) },
      dueOnly && { key: "due", label: "Follow-up due", clear: () => setDueOnly(false) },
    ] as ({ key: string; label: string; clear: () => void } | "" | false)[]
  ).filter((c): c is { key: string; label: string; clear: () => void } => Boolean(c));
  const clearAll = () => {
    setSegment("");
    setLoanProductId("");
    setStatus("");
    setSource("");
    setOwnerId("");
    setPartnerId("");
    setChannel("");
    setQuestion("");
    setAnswer("");
    setChatbot(false);
    setDueOnly(false);
  };
  const moreCount = [channel, partnerId, question].filter(Boolean).length;

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
            <button onClick={onOpenArchive} className="btn-ghost" title="Converted and lost leads that were moved out of this list">
              <Archive className="h-4 w-4" /> Archived
            </button>
            <ExportMenu type="leads" filters={exportFilters} />
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

      <div className="space-y-4 px-6 py-5">
        {/* Loan type: tabs with counts, the busiest few. */}
        {typeCounts.data && typeCounts.data.types.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-line" role="tablist" aria-label="Loan type">
            {[{ loanProductId: "", name: "All leads", count: typeCounts.data.total }, ...typeCounts.data.types.slice(0, 6)].map((t) => {
              const on = loanProductId === t.loanProductId;
              return (
                <button
                  key={t.loanProductId || "all"}
                  role="tab"
                  aria-selected={on}
                  onClick={() => reset(() => setLoanProductId(t.loanProductId))}
                  className={clsx(
                    "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-semibold transition",
                    on ? "border-navy text-navy" : "border-transparent text-muted hover:text-navy",
                  )}
                >
                  {t.name}
                  <span className={clsx("rounded-full px-1.5 text-[11px] font-bold", on ? "bg-navy text-white" : "bg-bg-light text-muted")}>{t.count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Priority at a glance: tap one to see only those leads. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => reset(() => setSegment(""))}
            className={clsx("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition", segment === "" ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy/40")}
          >
            All <span className="ml-1 opacity-70">{counts.data ? LEAD_SEGMENTS.reduce((n, k) => n + counts.data[k], 0) : "—"}</span>
          </button>
          {LEAD_SEGMENTS.map((k) => (
            <button
              key={k}
              onClick={() => reset(() => setSegment(segment === k ? "" : k))}
              title={LEAD_SEGMENT_HINT[k]}
              className={clsx("inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-[13px] font-semibold text-navy transition", segment === k ? "border-navy ring-2 ring-navy/15" : "border-line hover:border-navy/40")}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIORITY_META[k].color }} />
              {PRIORITY_META[k].label}
              <span className="text-muted">{counts.data ? counts.data[k] : "—"}</span>
            </button>
          ))}
          <button
            onClick={() => reset(() => setChatbot(!chatbot))}
            title="People who confirmed their mobile number with a code to use the website chat"
            className={clsx("inline-flex items-center gap-2 rounded-full border bg-white px-3.5 py-1.5 text-[13px] font-semibold text-navy transition", chatbot ? "border-navy ring-2 ring-navy/15" : "border-line hover:border-navy/40")}
          >
            <span className="h-2 w-2 rounded-full bg-violet-500" />
            Chatbot contacts
            <span className="text-muted">{counts.data ? counts.data.chatbot : "—"}</span>
          </button>
        </div>

        {/* Search and the few filters used most; the rest are in the column headings or under More filters. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
            <input value={search} onChange={(e) => reset(() => setSearch(e.target.value))} placeholder="Search name, phone or email" className="field w-full pl-9" />
          </div>
          <PeriodSelect value={timeRange} onChange={(v) => reset(() => setTimeRange(v))} className="field w-44" />
          <button onClick={() => reset(() => setDueOnly(!dueOnly))} className={clsx("btn-ghost", dueOnly && "border-navy/40 bg-navy/5")}>
            <AlertCircle className="h-4 w-4" />
            Follow-up due
          </button>
          <button onClick={() => setMoreOpen(!moreOpen)} className={clsx("btn-ghost", (moreOpen || moreCount > 0) && "border-navy/40 bg-navy/5")}>
            <SlidersHorizontal className="h-4 w-4" />
            More filters
            {moreCount > 0 && <span className="rounded-full bg-navy px-1.5 text-[11px] font-bold text-white">{moreCount}</span>}
          </button>
          <select value={sort} onChange={(e) => reset(() => setSort(e.target.value as LeadSortValue))} className="field ml-auto w-52" aria-label="Sort by" title="Sort the list">
            {LEAD_SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {moreOpen && (
          <div className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className={LABEL}>
              Channel
              <select value={channel} onChange={(e) => reset(() => setChannel(e.target.value))} className="field font-normal">
                <option value="">All channels</option>
                <option value="none">Not tracked</option>
                {(channels.data ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Sourced by
              <select value={partnerId} onChange={(e) => reset(() => setPartnerId(e.target.value))} className="field font-normal">
                <option value="">Everyone</option>
                <option value="none">Ourselves</option>
                {partners.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {(questions.data?.length ?? 0) > 0 && (
              <>
                <label className={LABEL}>
                  Form question
                  <select value={question} onChange={(e) => reset(() => { setQuestion(e.target.value); setAnswer(""); })} className="field font-normal">
                    <option value="">Any</option>
                    {questions.data?.map((q) => (
                      <option key={q.question} value={q.question}>
                        {q.question} ({q.count})
                      </option>
                    ))}
                  </select>
                </label>
                {question && (
                  <label className={LABEL}>
                    Answer contains
                    <input value={answer} onChange={(e) => reset(() => setAnswer(e.target.value))} placeholder="Part of the answer" className="field font-normal" />
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {/* What is filtering the list right now, each removable. */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-muted">Filtered by</span>
            {chips.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full bg-navy/10 px-3 py-1 font-semibold text-navy">
                {c.label}
                <button onClick={() => reset(c.clear)} className="rounded-full px-0.5 text-navy/60 hover:text-navy" aria-label={`Remove ${c.label}`}>
                  ×
                </button>
              </span>
            ))}
            <button onClick={() => reset(clearAll)} className="font-semibold text-muted underline hover:text-navy">
              Clear all
            </button>
          </div>
        )}

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <TableSkeleton />
          ) : query.isError ? (
            <p className="py-16 text-center text-sm text-red-600">{(query.error as Error).message}</p>
          ) : !query.data.items.length ? (
            <p className="py-16 text-center text-sm text-muted">No leads match these filters.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line text-[12px] text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3">
                    <ColumnFilter label="Priority" value={segment} onChange={(v) => reset(() => setSegment(v as LeadSegment | ""))} options={LEAD_SEGMENTS.map((k) => ({ value: k, label: PRIORITY_META[k].label }))} />
                  </th>
                  <th className="px-4 py-3">
                    <ColumnFilter label="Loan" value={loanProductId} onChange={(v) => reset(() => setLoanProductId(v))} allLabel="All loan types" options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
                  </th>
                  <th className="px-4 py-3">
                    <ColumnFilter label="Source" value={source} onChange={(v) => reset(() => setSource(v))} allLabel="All sources" options={Object.entries(ENTRY_LABEL).map(([value, label]) => ({ value, label }))} />
                  </th>
                  <th className="px-4 py-3">
                    {canFilterOwner ? (
                      <ColumnFilter label="Owner" value={ownerId} onChange={(v) => reset(() => setOwnerId(v))} allLabel="Everyone" options={[{ value: "none", label: "Unassigned" }, ...(staff.data ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
                    ) : (
                      <span className="font-semibold">Owner</span>
                    )}
                  </th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3">
                    <ColumnFilter label="Status" value={status} onChange={(v) => reset(() => setStatus(v))} allLabel="All statuses" options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }))} />
                  </th>
                  {user?.role === "ADMIN" && <th className="w-10 px-2 py-3" aria-label="Delete" />}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((lead) => (
                  <tr key={lead.id} className="border-b border-line/60 align-top last:border-0 hover:bg-bg-light/60">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy/10 text-[12px] font-bold text-navy">
                          {initials(lead.name)}
                        </span>
                        <div className="min-w-0">
                          <Link to="/leads/$leadId" params={{ leadId: lead.id }} className="font-semibold text-navy hover:text-gold-dark">
                            {lead.name}
                          </Link>
                          {lead.archivedAt && <ArchivedBadge />}
                          <p className="flex flex-wrap items-center text-[12px] text-muted">
                            <span>
                              #{lead.leadNo} · {lead.phone}
                              {lead.city && ` · ${lead.city}`}
                            </span>
                            <ContactLinks phone={lead.phone} email={lead.email} />
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <SegmentBadge segment={lead.segment} note={lead.segmentNote} />
                      {lead.segmentNote && lead.segment && (
                        <p className="mt-1 max-w-[200px] truncate text-[11px] text-muted" title={lead.segmentNote}>
                          {lead.segmentNote}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-navy">{formatAmount(lead.amount)}</p>
                      <p className="text-[12px] text-muted">{lead.loanProduct?.name ?? "—"}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-navy">{entryLabel(lead.source)}</p>
                      <p className="text-[12px] text-muted">{[lead.channel, lead.sourcingPartner?.name ?? "Self"].filter(Boolean).join(" · ")}</p>
                      {lead.chatVerifiedAt && (
                        <span title={`Verified on chat ${formatDate(lead.chatVerifiedAt)}`} className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                          Chat verified
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-muted">{lead.assignedOfficer?.name ?? <span className="text-amber-600">Unassigned</span>}</td>
                    <td className="px-4 py-4">
                      <p className="text-muted">
                        {lead.lastContactAt ? (
                          <span title={`${lead.contactCount} call${lead.contactCount === 1 ? "" : "s"} or note${lead.contactCount === 1 ? "" : "s"} logged`}>Last: {ago(lead.lastContactAt)}</span>
                        ) : (
                          <span className="text-muted/70">No contact yet</span>
                        )}
                      </p>
                      {lead.nextFollowUpAt && (
                        <p className={clsx("text-[12px]", isOverdue(lead.nextFollowUpAt) ? "font-semibold text-red-600" : "text-muted")}>Follow-up {formatDate(lead.nextFollowUpAt)}</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    {user?.role === "ADMIN" && (
                      <td className="px-2 py-4 text-right">
                        <button
                          onClick={() => setToDelete(lead)}
                          title={`Delete lead #${lead.leadNo} permanently`}
                          aria-label={`Delete lead #${lead.leadNo} ${lead.name}`}
                          className="rounded p-1.5 text-muted transition hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {toDelete && (
          <LeadDeleteDialog
            lead={toDelete}
            onDone={() => void queryClient.invalidateQueries({ queryKey: ["leads"] })}
            onClose={() => setToDelete(null)}
          />
        )}

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

/** The Leads page: the working list, and a separate Archived section for converted and lost leads moved out of it. */
export function LeadsPage() {
  const link = useSearch({ strict: false }) as LeadLinkFilter;
  const [view, setView] = useState<"active" | "archived">(link.view === "archived" ? "archived" : "active");
  return view === "archived" ? <ArchivedLeads onBack={() => setView("active")} /> : <ActiveLeadsPage onOpenArchive={() => setView("archived")} />;
}
