import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Download, Loader2, Plus, Search, Upload } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { downloadReport } from "../lib/download-report";
import { todayIST } from "../lib/date";
import { formatAmount, formatDate, humanize, isOverdue } from "../lib/format";
import {
  EMPLOYMENT_TYPE_LABEL,
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  type EmploymentType,
  type Lead,
  type Paginated,
} from "../lib/types";
import { PageHeader } from "../components/app-shell";
import { LeadStatusBadge } from "../components/status-badge";
import { Modal } from "../components/modal";
import { LeadImportModal } from "../components/lead-import-modal";
import { PeriodSelect } from "../components/period-select";
import { DatePicker } from "../components/date-picker";

type Partner = { id: string; name: string };

type Product = { id: string; name: string; slug: string };
type Assignable = { id: string; name: string };

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

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/leads", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: onCreated,
  });

  return (
    <Modal title="New Lead" subtitle="Add a new prospect to the system" onClose={onClose}>
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
            nextFollowUpAt: f.get("nextFollowUpAt")
              ? new Date(f.get("nextFollowUpAt") as string).toISOString()
              : undefined,
            detail: f.get("detail") || undefined,
            source: "manual-entry",
          });
        }}
        className="grid gap-2.5 sm:grid-cols-2"
      >
        {create.isError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:col-span-2">
            {(create.error as Error).message}
          </p>
        )}
        <input name="name" required placeholder="Full name" className="field sm:col-span-2" />
        <input name="phone" required placeholder="10-digit phone" className="field" />
        <input name="email" type="email" placeholder="Email (optional)" className="field" />
        <input name="city" placeholder="City" className="field" />
        <input name="amount" type="number" placeholder="Loan amount" className="field" />
        <select name="productSlug" defaultValue="" className="field sm:col-span-2">
          <option value="">Loan product (optional)</option>
          {products.data?.map((p) => (
            <option key={p.id} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="text-[12px] font-semibold text-muted">
          Relationship officer
          <select name="assignedOfficerId" defaultValue="" className="field mt-1">
            <option value="">Unassigned</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Sales manager
          <select name="assignedManagerId" defaultValue="" className="field mt-1">
            <option value="">None</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Reference type
          <select
            value={reference}
            onChange={(e) => setReference(e.target.value as "self" | "partner")}
            className="field mt-1"
          >
            <option value="self">Self</option>
            <option value="partner">Sourcing partner</option>
          </select>
        </label>
        {reference === "partner" ? (
          <label className="text-[12px] font-semibold text-muted">
            Partner
            <select name="sourcingPartnerId" required defaultValue="" className="field mt-1">
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
          <span />
        )}
        <label className="text-[12px] font-semibold text-muted">
          Employment type
          <select name="employmentType" defaultValue="" className="field mt-1">
            <option value="">Not known</option>
            {(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Monthly income (₹)
          <input name="monthlyIncome" type="number" min={0} placeholder="e.g. 50000" className="field mt-1" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Next meeting / follow-up
          <DatePicker name="nextFollowUpAt" className="mt-1" min={todayIST()} placeholder="Pick a date" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Meeting mode
          <select name="meetingMode" defaultValue="" className="field mt-1">
            <option value="">Not set</option>
            <option value="In-person">In-person</option>
            <option value="Phone">Phone</option>
            <option value="Video">Video</option>
          </select>
        </label>
        <input name="meetingPlace" placeholder="Place of contact" className="field sm:col-span-2" />
        <textarea
          name="detail"
          placeholder="Notes (optional)"
          className="field min-h-[70px] resize-none sm:col-span-2"
        />
        <button type="submit" disabled={create.isPending} className="btn-primary sm:col-span-2">
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Create lead
        </button>
      </form>
    </Modal>
  );
}

export function LeadsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [loanProductId, setLoanProductId] = useState("");
  const [timeRange, setTimeRange] = useState("all");
  const [page, setPage] = useState(1);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const products = useQuery({
    queryKey: ["loan-products"],
    queryFn: () => api<Product[]>("/loan-products"),
  });

  const query = useQuery({
    queryKey: ["leads", { search, status, dueOnly, loanProductId, timeRange, page }],
    queryFn: () =>
      api<Paginated<Lead>>(
        `/leads${qs({ search, status, loanProductId, range: timeRange, dueOnly: dueOnly ? "true" : undefined, page })}`,
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

          <PeriodSelect value={timeRange} onChange={(v) => reset(() => setTimeRange(v))} className="field w-56" />

          <button
            onClick={() => reset(() => setDueOnly(!dueOnly))}
            className={clsx("btn-ghost", dueOnly && "border-navy/40 bg-navy/5")}
          >
            <AlertCircle className="h-4 w-4" />
            Follow-up due
          </button>
        </div>

        <div className="card overflow-x-auto">
          {query.isPending ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading leads…
            </div>
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
                  <th className="px-4 py-2.5 font-bold">Product</th>
                  <th className="px-4 py-2.5 font-bold">Amount</th>
                  <th className="px-4 py-2.5 font-bold">Reference</th>
                  <th className="px-4 py-2.5 font-bold">Owner</th>
                  <th className="px-4 py-2.5 font-bold">Follow-up</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((lead) => (
                  <tr key={lead.id} className="border-b border-line/70 last:border-0 hover:bg-bg-light/70">
                    <td className="px-4 py-3">
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: lead.id }}
                        className="font-semibold text-navy hover:text-gold-dark"
                      >
                        {lead.name}
                      </Link>
                      <p className="text-[12px] text-muted">
                        #{lead.leadNo} · {lead.phone}
                        {lead.city && ` · ${lead.city}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted">{lead.loanProduct?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{formatAmount(lead.amount)}</td>
                    <td className="px-4 py-3 text-muted">
                      {lead.sourcingPartner?.name ?? "Self"}
                      <p className="text-[11px]">{humanize(lead.source)}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {lead.assignedOfficer?.name ?? (
                        <span className="text-amber-600">Unassigned</span>
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
              Page {query.data.page} of {Math.ceil(query.data.total / query.data.pageSize)}
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
