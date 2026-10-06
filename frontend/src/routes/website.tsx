import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Copy, Globe, Loader2, Search, Users } from "lucide-react";
import clsx from "clsx";
import { api, qs } from "../lib/api";
import { formatAmount, formatDateTime } from "../lib/format";
import {
  OUTCOME_LABEL,
  formLabel,
  type Submission,
  type SubmissionList,
  type SubmissionOutcome,
} from "../lib/website";
import { PageHeader } from "../components/app-shell";
import { LeadStatusBadge } from "../components/status-badge";
import { PeriodSelect } from "../components/period-select";
import { TableSkeleton } from "../components/skeleton";
import { WebsiteAds } from "../components/website-ads";

function Tile({
  label,
  value,
  hint,
  onClick,
  active,
}: {
  label: string;
  value: number;
  hint: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-navy">
        {value.toLocaleString("en-IN")}
      </p>
      <p className="mt-0.5 text-[12px] text-muted">{hint}</p>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "card p-4 text-left transition hover:border-navy/30",
        active && "border-navy/50 bg-navy/5",
      )}
    >
      {body}
    </button>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

function Details({ s }: { s: Submission }) {
  const rows: [string, string | null][] = [
    ["Email", s.email],
    ["City", s.city],
    ["Loan type", s.loanType],
    ["Amount", s.amount ? formatAmount(s.amount) : null],
    ["Message", s.detail],
    ["Landing page", s.landingPage],
  ];
  const shown = rows.filter(([, v]) => v);
  return shown.length ? (
    <dl className="mt-1 space-y-0.5 text-[12px] text-muted">
      {shown.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="shrink-0 font-semibold">{k}:</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="mt-1 text-[12px] text-muted">Name and phone only.</p>
  );
}

/** The other entries that were merged into the same lead as `s`, loaded only when asked for. */
function OtherEntries({ s }: { s: Submission }) {
  const others = useQuery({
    queryKey: ["website-submissions", "lead", s.leadId],
    queryFn: () =>
      api<SubmissionList>(
        `/website-submissions${qs({ leadId: s.leadId ?? "", pageSize: 50 })}`,
      ),
  });
  if (others.isPending)
    return <Loader2 className="h-4 w-4 animate-spin text-muted" />;
  if (others.isError)
    return (
      <p className="text-[12px] text-red-600">
        {(others.error as Error).message}
      </p>
    );
  const rest = others.data.items.filter((o) => o.id !== s.id);
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
        The same person's other entries
      </p>
      {rest.map((o) => (
        <div
          key={o.id}
          className="rounded-md border border-line bg-white px-3 py-2"
        >
          <p className="text-[12px] text-muted">
            <span className="font-semibold text-navy">{formLabel(o.form)}</span>{" "}
            · {formatDateTime(o.receivedAt)} · {o.entries} of 7 fields ·{" "}
            {o.name}, {o.phone}
          </p>
          <Details s={o} />
        </div>
      ))}
    </div>
  );
}

export function WebsitePage() {
  const [tab, setTab] = useState<"entries" | "ads">("entries");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState("");
  const [outcome, setOutcome] = useState<SubmissionOutcome | "">("");
  const [timeRange, setTimeRange] = useState("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null); // the row whose duplicate entries are showing
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const query = useQuery({
    queryKey: [
      "website-submissions",
      { search, form, outcome, timeRange, page },
    ],
    queryFn: () =>
      api<SubmissionList>(
        `/website-submissions${qs({ search, form, outcome, range: timeRange, page })}`,
      ),
    placeholderData: (prev) => prev,
  });
  const summary = query.data?.summary;

  return (
    <>
      <PageHeader
        title="Website"
        subtitle={
          tab === "entries"
            ? "Every entry the website's forms send in. The same person sending twice becomes one lead; the fuller entry wins."
            : "The poster that pops up on the website, and the days it runs."
        }
        actions={
          <div
            role="tablist"
            className="flex gap-1 rounded-full border border-line bg-white p-1 text-[13px] font-semibold"
          >
            {(
              [
                ["entries", "Entries"],
                ["ads", "Pop-up ad"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={clsx(
                  "rounded-full px-3.5 py-1",
                  tab === key
                    ? "bg-navy text-white"
                    : "text-muted hover:text-navy",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      {tab === "ads" ? (
        <WebsiteAds />
      ) : (
        <div className="px-6 py-5">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <Tile
              label="Entries received"
              value={summary?.received ?? 0}
              hint="All forms, in this period"
              onClick={() => reset(() => setOutcome(""))}
              active={!outcome}
            />
            <Tile
              label="New leads"
              value={summary?.newLeads ?? 0}
              hint="Became a lead of their own"
              onClick={() =>
                reset(() =>
                  setOutcome(outcome === "NEW_LEAD" ? "" : "NEW_LEAD"),
                )
              }
              active={outcome === "NEW_LEAD"}
            />
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <input
                value={search}
                onChange={(e) => reset(() => setSearch(e.target.value))}
                placeholder="Name, phone, email or city"
                className="field w-64 pl-9"
              />
            </div>
            <select
              value={form}
              onChange={(e) => reset(() => setForm(e.target.value))}
              className="field w-56"
              aria-label="Form"
            >
              <option value="">All forms</option>
              {(query.data?.forms ?? []).map((f) => (
                <option key={f.form} value={f.form}>
                  {formLabel(f.form)} ({f.count})
                </option>
              ))}
            </select>
            <select
              value={outcome}
              onChange={(e) =>
                reset(() =>
                  setOutcome(e.target.value as SubmissionOutcome | ""),
                )
              }
              className="field w-52"
              aria-label="Result"
            >
              <option value="">Every result</option>
              {(Object.keys(OUTCOME_LABEL) as SubmissionOutcome[]).map((o) => (
                <option key={o} value={o}>
                  {OUTCOME_LABEL[o].label}
                </option>
              ))}
            </select>
            <PeriodSelect
              value={timeRange}
              onChange={(v) => reset(() => setTimeRange(v))}
              className="field w-56"
            />
          </div>

          <div className="card overflow-x-auto">
            {query.isPending ? (
              <TableSkeleton />
            ) : query.isError ? (
              <p className="py-16 text-center text-sm text-red-600">
                {(query.error as Error).message}
              </p>
            ) : !query.data.items.length ? (
              <div className="py-16 text-center text-sm text-muted">
                <Globe className="mx-auto mb-2 h-6 w-6 text-muted/50" />
                {summary?.received
                  ? "No entries match these filters."
                  : "Nothing has come in from the website yet. Entries appear here as soon as a form is submitted."}
              </div>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">Received</th>
                    <th className="px-4 py-2.5 font-bold">Who</th>
                    <th className="px-4 py-2.5 font-bold">Form</th>
                    <th className="px-4 py-2.5 font-bold">What they sent</th>
                    <th className="px-4 py-2.5 font-bold">Result</th>
                    <th className="px-4 py-2.5 font-bold">Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((s) => {
                    const o = OUTCOME_LABEL[s.outcome];
                    return (
                      <Fragment key={s.id}>
                        <tr className="border-b border-line/70 align-top last:border-0 hover:bg-bg-light/70">
                          <td className="px-4 py-3 whitespace-nowrap text-muted">
                            {formatDateTime(s.receivedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-navy">{s.name}</p>
                            <p className="text-muted">{s.phone}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formLabel(s.form)}
                          </td>
                          <td className="max-w-sm px-4 py-3">
                            <p className="text-[12px] font-semibold text-muted">
                              {s.entries} of 7 fields filled
                            </p>
                            <Details s={s} />
                          </td>
                          <td className="px-4 py-3">
                            <span
                              title={o.hint}
                              className={clsx(
                                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
                                o.chip,
                              )}
                            >
                              {o.label}
                            </span>
                            {s.others > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenId(openId === s.id ? null : s.id)
                                }
                                aria-expanded={openId === s.id}
                                className="mt-1 flex items-center gap-1 text-left text-[11px] font-semibold text-amber-700 hover:underline"
                              >
                                {s.outcome === "NEW_LEAD"
                                  ? `Sent again ${s.others}×`
                                  : "Duplicate of an earlier entry"}
                                <ChevronDown
                                  className={clsx(
                                    "h-3 w-3 transition-transform",
                                    openId === s.id && "rotate-180",
                                  )}
                                />
                              </button>
                            )}
                            {s.sharedPhone && (
                              <span
                                title="Another open lead has this phone number under a different name"
                                className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                              >
                                <Users className="h-3 w-3" /> Shared phone
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {s.lead ? (
                              <>
                                <Link
                                  to="/leads/$leadId"
                                  params={{ leadId: s.lead.id }}
                                  className="inline-flex items-center gap-1 font-semibold text-navy hover:underline"
                                >
                                  #{s.lead.leadNo} {s.lead.name}
                                  {s.outcome !== "NEW_LEAD" && (
                                    <Copy
                                      className="h-3 w-3 text-muted"
                                      aria-label="Merged into this lead"
                                    />
                                  )}
                                </Link>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                                  <LeadStatusBadge status={s.lead.status} />
                                  {s.lead.assignedOfficer?.name ?? (
                                    <span className="text-amber-600">
                                      Unassigned
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted">Lead removed</span>
                            )}
                          </td>
                        </tr>
                        {openId === s.id && (
                          <tr className="border-b border-line/70 bg-bg-light/60">
                            <td colSpan={6} className="px-4 py-3">
                              <OtherEntries s={s} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {query.data && query.data.total > query.data.pageSize && (
            <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
              <span>
                Page {query.data.page} of{" "}
                {Math.ceil(query.data.total / query.data.pageSize)}
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
                  disabled={
                    page >= Math.ceil(query.data.total / query.data.pageSize)
                  }
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
