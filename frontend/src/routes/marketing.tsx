import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Download, Link2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api, qs, tokenStore } from "../lib/api";
import { formatDate } from "../lib/format";
import { todayIST } from "../lib/date";
import { TRACKING_PRESETS, buildTrackingLink, monthLabel, percent, rupees, type Funnel, type MarketingRow, type Performance, type SpendEntry } from "../lib/marketing";
import { PageHeader } from "../components/app-shell";
import { PeriodSelect } from "../components/period-select";
import { Modal } from "../components/modal";
import { DatePicker } from "../components/date-picker";
import { ChannelInput } from "../components/channel-field";
import { TableSkeleton } from "../components/skeleton";

type By = Performance["by"];
const VIEWS: { key: By; label: string; head: string }[] = [
  { key: "channel", label: "By channel", head: "Channel" },
  { key: "campaign", label: "By campaign", head: "Channel / campaign" },
  { key: "landing", label: "By landing page", head: "Landing page" },
  { key: "month", label: "By month", head: "Month" },
];

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className={clsx("mt-1 text-xl font-bold", tone === "good" ? "text-emerald-700" : "text-navy")}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

function FunnelBars({ funnel }: { funnel: Funnel }) {
  const top = Math.max(1, funnel[0]?.count ?? 1);
  return (
    <div className="card p-5">
      <h2 className="text-sm font-bold text-navy">From lead to disbursal</h2>
      <p className="mt-0.5 text-[13px] text-muted">The leads that came in during this period, and how far they have got since.</p>
      <ol className="mt-4 space-y-2.5">
        {funnel.map((s, i) => (
          <li key={s.stage} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-[13px]">
            <span className="font-semibold text-navy">{s.stage}</span>
            <span className="h-6 overflow-hidden rounded bg-bg-light" role="img" aria-label={`${s.stage}: ${s.count}`}>
              <span className="block h-full rounded bg-navy transition-[width] duration-500" style={{ width: `${Math.max(s.count ? 2 : 0, (s.count / top) * 100)}%`, opacity: 1 - i * 0.14 }} />
            </span>
            <span className="w-36 text-right text-muted">
              <span className="font-semibold text-ink">{s.count}</span>
              {i > 0 && s.ofPrevious !== null && ` · ${s.ofPrevious}% of ${funnel[i - 1].stage.toLowerCase()}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SpendModal({ entry, onClose }: { entry?: SpendEntry; onClose: () => void }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      entry ? api(`/marketing/spend/${entry.id}`, { method: "PATCH", body: JSON.stringify(body) }) : api("/marketing/spend", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-spend"] });
      void queryClient.invalidateQueries({ queryKey: ["marketing-performance"] });
      onClose();
    },
  });
  return (
    <Modal title={entry ? "Edit spend" : "Log marketing spend"} subtitle="What was paid, so cost per lead can be worked out" onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const text = (k: string) => ((f.get(k) as string) ?? "").trim();
          save.mutate({
            spentOn: text("spentOn"),
            channel: text("channel"),
            campaign: text("campaign") || (entry ? null : undefined),
            vendor: text("vendor") || (entry ? null : undefined),
            amount: Number(text("amount")),
            note: text("note") || (entry ? null : undefined),
          });
        }}
      >
        <label className="text-[12px] font-semibold text-muted">
          Date
          <DatePicker name="spentOn" required defaultValue={entry?.spentOn.slice(0, 10) ?? todayIST()} clearable={false} className="mt-1" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Amount (₹)
          <input name="amount" required type="number" min={0.01} step="0.01" defaultValue={entry?.amount} className="field mt-1 font-normal" />
        </label>
        <label className="text-[12px] font-semibold text-muted sm:col-span-2">
          Channel
          <ChannelInput name="channel" id="spend-channels" defaultValue={entry?.channel} className="field mt-1 font-normal" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Campaign (optional)
          <input name="campaign" maxLength={120} defaultValue={entry?.campaign ?? ""} className="field mt-1 font-normal" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Agency / vendor (optional)
          <input name="vendor" maxLength={120} defaultValue={entry?.vendor ?? ""} className="field mt-1 font-normal" />
        </label>
        <label className="text-[12px] font-semibold text-muted sm:col-span-2">
          Note (optional)
          <input name="note" maxLength={300} defaultValue={entry?.note ?? ""} placeholder="e.g. invoice number" className="field mt-1 font-normal" />
        </label>
        {save.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 sm:col-span-2">{(save.error as Error).message}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {entry ? "Save changes" : "Log spend"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SpendLog({ period }: { period: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SpendEntry | "new" | null>(null);
  const query = useQuery({
    queryKey: ["marketing-spend", period],
    queryFn: () => api<{ items: SpendEntry[]; total: number; count: number }>(`/marketing/spend${qs({ range: period })}`),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/marketing/spend/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-spend"] });
      void queryClient.invalidateQueries({ queryKey: ["marketing-performance"] });
    },
  });
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-navy">Spend log</h2>
          <p className="text-[13px] text-muted">{query.data ? `${query.data.count} ${query.data.count === 1 ? "entry" : "entries"} · ${rupees(query.data.total)} in this period` : "What has been spent"}</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Log spend
        </button>
      </div>
      {query.isPending ? (
        <TableSkeleton />
      ) : query.data?.items.length ? (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                {["Date", "Channel", "Campaign", "Vendor", "Amount", "Note", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((s) => (
                <tr key={s.id} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(s.spentOn)}</td>
                  <td className="px-4 py-2.5 font-semibold text-navy">{s.channel}</td>
                  <td className="px-4 py-2.5 text-muted">{s.campaign ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{s.vendor ?? "—"}</td>
                  <td className="px-4 py-2.5 font-semibold whitespace-nowrap">{rupees(Number(s.amount))}</td>
                  <td className="px-4 py-2.5 text-muted">{s.note ?? ""}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <button className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-navy" title="Edit" aria-label="Edit spend" onClick={() => setEditing(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-red-600"
                      title="Remove"
                      aria-label="Remove spend"
                      onClick={() => window.confirm(`Remove ${rupees(Number(s.amount))} spent on ${s.channel}?`) && remove.mutate(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-8 text-center text-[13px] text-muted">Nothing logged for this period. Add what the agency or the ad accounts billed so cost per lead can be shown.</p>
      )}
      {editing && <SpendModal entry={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function LinkBuilder() {
  const [base, setBase] = useState("https://growthcapitalservices.in/");
  const [presetIndex, setPresetIndex] = useState(0);
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const link = buildTrackingLink(base, TRACKING_PRESETS[presetIndex], campaign, content);
  return (
    <details className="card p-5">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-navy">
        <Link2 className="h-4 w-4" /> Tracking-link builder
      </summary>
      <p className="mt-2 text-[13px] text-muted">
        Use these links in ads, posts and messages. A lead that arrives through one is credited to its channel and campaign automatically — no one has to remember to tag it.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-semibold text-muted sm:col-span-2">
          Page the link opens
          <input value={base} onChange={(e) => setBase(e.target.value)} className="field mt-1 font-normal" />
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Channel
          <select value={presetIndex} onChange={(e) => setPresetIndex(Number(e.target.value))} className="field mt-1 font-normal">
            {TRACKING_PRESETS.map((p, i) => (
              <option key={p.channel} value={i}>{p.channel}</option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-semibold text-muted">
          Campaign name
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. Business loan Oct 2026" className="field mt-1 font-normal" />
        </label>
        <label className="text-[12px] font-semibold text-muted sm:col-span-2">
          Ad or creative (optional)
          <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="e.g. headline A, reel 3" className="field mt-1 font-normal" />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-1.5 rounded-md border border-line bg-bg-light px-2.5 py-1.5">
        <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={link ?? ""}>{link ?? "Enter a web address to build the link"}</p>
        <button
          disabled={!link}
          onClick={() => {
            if (!link) return;
            void navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded p-1 text-muted transition hover:bg-white hover:text-navy disabled:opacity-40"
          title="Copy link"
          aria-label="Copy link"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </details>
  );
}

export function MarketingPage() {
  const [period, setPeriod] = useState("month");
  const [by, setBy] = useState<By>("channel");

  const overall = useQuery({ queryKey: ["marketing-performance", "channel", period], queryFn: () => api<Performance>(`/marketing/performance${qs({ by: "channel", range: period })}`) });
  const table = useQuery({
    queryKey: ["marketing-performance", by, period],
    queryFn: () => api<Performance>(`/marketing/performance${qs({ by, range: period })}`),
    placeholderData: (prev) => prev,
  });

  const exportCsv = async () => {
    const res = await fetch(`/crm/api/marketing/performance/export${qs({ by, range: period })}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `gcs-marketing-${by}-${todayIST()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const t = overall.data?.total;
  const head = VIEWS.find((v) => v.key === by)!.head;
  const rows = table.data?.rows ?? [];
  const maxLeads = Math.max(1, ...rows.map((r) => r.leads));
  const label = (r: MarketingRow) => (by === "month" ? monthLabel(r.key) : r.key);

  return (
    <>
      <PageHeader
        title="Marketing"
        subtitle="Where leads come from, what they cost, and what they became"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSelect value={period} onChange={setPeriod} className="field w-56" />
            <button className="btn-ghost" onClick={() => void exportCsv()}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        }
      />
      <div className="space-y-5 px-6 py-5">
        {overall.isPending ? (
          <TableSkeleton />
        ) : t ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
              <Tile label="Spend" value={rupees(t.spend)} hint={overall.data?.period} />
              <Tile label="Leads" value={String(t.leads)} hint={t.lost ? `${t.lost} lost` : undefined} />
              <Tile label="Cost per lead" value={rupees(t.costPerLead)} />
              <Tile label="Qualified" value={String(t.qualified)} hint={t.qualifiedRate !== null ? `${t.qualifiedRate}% of leads` : undefined} />
              <Tile label="Cost per qualified lead" value={rupees(t.costPerQualified)} />
              <Tile label="Disbursed" value={rupees(t.disbursedAmount)} hint={t.disbursed ? `${t.disbursed} ${t.disbursed === 1 ? "loan" : "loans"} · ${rupees(t.costPerDisbursal)} of spend per loan` : "None disbursed yet"} tone={t.disbursed ? "good" : undefined} />
            </div>
            <FunnelBars funnel={overall.data!.funnel} />
          </>
        ) : null}

        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="tablist" aria-label="Group by">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  role="tab"
                  aria-selected={by === v.key}
                  onClick={() => setBy(v.key)}
                  className={clsx("rounded-md px-3 py-1.5 text-[13px] font-semibold transition", by === v.key ? "bg-navy text-white" : "text-muted hover:text-navy")}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-muted">
              Leads are those created in the period; later stages count those same leads, whenever they got there.
            </p>
          </div>
          {table.isPending ? (
            <TableSkeleton />
          ) : rows.length ? (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                  <tr>
                    {[head, "Spend", "Leads", "Cost / lead", "Qualified", "Cost / qualified", "Applications", "Disbursed", "Cost / disbursal", "Disbursed ₹", "Return"].map((h) => (
                      <th key={h} className={clsx("px-3 py-2.5 font-bold", h !== head && "text-right")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-line/70 last:border-0">
                      <td className="max-w-64 px-3 py-2.5 font-semibold text-navy">
                        {label(r)}
                        {r.key === "Not tracked" && <span className="ml-1.5 text-[11px] font-normal text-muted">(no channel recorded)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{table.data?.spendTracked ? rupees(r.spend) : "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-bg-light sm:block" aria-hidden>
                            <span className="block h-full rounded-full bg-navy/70" style={{ width: `${(r.leads / maxLeads) * 100}%` }} />
                          </span>
                          {r.leads}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{rupees(r.costPerLead)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{r.qualified} <span className="text-muted">({percent(r.qualifiedRate)})</span></td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{rupees(r.costPerQualified)}</td>
                      <td className="px-3 py-2.5 text-right">{r.applications}</td>
                      <td className="px-3 py-2.5 text-right">{r.disbursed}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{rupees(r.costPerDisbursal)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{rupees(r.disbursedAmount)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" title="Commission earned for every ₹1 spent">{r.returnOnSpend === null ? "—" : `${r.returnOnSpend}×`}</td>
                    </tr>
                  ))}
                  {table.data && (
                    <tr className="border-t-2 border-line bg-bg-light/60 font-bold text-navy">
                      <td className="px-3 py-2.5">Total</td>
                      <td className="px-3 py-2.5 text-right">{rupees(table.data.total.spend)}</td>
                      <td className="px-3 py-2.5 text-right">{table.data.total.leads}</td>
                      <td className="px-3 py-2.5 text-right">{rupees(table.data.total.costPerLead)}</td>
                      <td className="px-3 py-2.5 text-right">{table.data.total.qualified}</td>
                      <td className="px-3 py-2.5 text-right">{rupees(table.data.total.costPerQualified)}</td>
                      <td className="px-3 py-2.5 text-right">{table.data.total.applications}</td>
                      <td className="px-3 py-2.5 text-right">{table.data.total.disbursed}</td>
                      <td className="px-3 py-2.5 text-right">{rupees(table.data.total.costPerDisbursal)}</td>
                      <td className="px-3 py-2.5 text-right">{rupees(table.data.total.disbursedAmount)}</td>
                      <td className="px-3 py-2.5 text-right">{table.data.total.returnOnSpend === null ? "—" : `${table.data.total.returnOnSpend}×`}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-muted">No leads or spend in this period yet.</p>
          )}
          {by === "landing" && <p className="mt-2 text-[12px] text-muted">Spend can only be tied to a channel or campaign, so it is not split by page.</p>}
          {table.data?.rows.some((r) => r.key === "Not tracked") && (
            <p className="mt-2 text-[12px] text-muted">
              “Not tracked” leads arrived with no channel. Credit them on the lead itself, and use the tracking-link builder below so new ones are tagged automatically.
            </p>
          )}
        </section>

        <SpendLog period={period} />
        <LinkBuilder />

        <details className="card p-5">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-navy">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Before advertising loans
          </summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] text-muted">
            <li>Have ad copy, eligibility and interest-rate claims, approval promises, testimonials and disclaimers checked against the ad platforms' rules and Indian finance-sector requirements before a campaign goes live.</li>
            <li>Avoid absolute promises such as “100% guaranteed approval” or “instant guaranteed loan” unless they are genuinely true and permitted.</li>
            <li>How the firm is classified — DSA, loan service provider, NBFC, broker, consultant or direct lender — changes what an advertisement may say. Settle that first.</li>
            <li>A cheap lead is not a valuable lead: judge a channel by cost per qualified lead and per disbursal, not cost per lead alone.</li>
          </ul>
        </details>
      </div>
    </>
  );
}
