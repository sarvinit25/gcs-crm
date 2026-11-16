import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { PageHeader } from "../components/app-shell";

type Period = { calls: number; failed: number; tokensIn: number; tokensOut: number; estUsd: number | null; operations: Record<string, number> };
type Summary = {
  generatedAt: string;
  trackingSince: string | null;
  months: { thisMonth: string; lastMonth: string };
  services: { name: string; thisMonth: Period; lastMonth: Period }[];
  plivo: { balanceUsd: number | null; configured: boolean };
  voice: { thisMonth: { calls: number; minutes: number }; lastMonth: { calls: number; minutes: number } };
  whatsapp: { thisMonth: number; lastMonth: number };
  alerts: string[];
  balances: { service: string; balance: string | null; usedThisMonth: string | null; usedLastMonth: string | null; note: string }[];
  rates: { sarvamInrPerMin: number | null; whatsappInrPerMessage: number | null };
  spend: { thisMonth: { sarvamInr: number | null; whatsappInr: number | null }; lastMonth: { sarvamInr: number | null; whatsappInr: number | null } };
};

const WHAT: Record<string, string> = {
  OpenAI: "Website assistant, WhatsApp intake, lender-offer reading, loan profile",
  Plivo: "Calling and phone numbers",
  "WhatsApp (Meta)": "Messages the CRM sends on WhatsApp, including sign-in codes for people with no email"
};
const n = (v: number) => v.toLocaleString("en-IN");
const monthName = (iso: string) => new Date(iso).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const inr = (v: number | null) => (v === null ? "—" : `₹${v.toLocaleString("en-IN")}`);
const usd = (v: number | null) => (v === null ? "—" : `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`);

function Block({ title, a, b, aLabel, bLabel }: { title: string; a: React.ReactNode; b: React.ReactNode; aLabel: string; bLabel: string }) {
  return (
    <div className="card p-4">
      <h3 className="text-[12px] font-bold tracking-wide text-muted uppercase">{title}</h3>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div><p className="text-lg font-bold text-navy">{a}</p><p className="text-[11px] text-muted">{aLabel}</p></div>
        <div><p className="text-lg font-semibold text-muted">{b}</p><p className="text-[11px] text-muted">{bLabel}</p></div>
      </div>
    </div>
  );
}

export function ApiUsagePage() {
  const q = useQuery({ queryKey: ["api-usage"], queryFn: () => api<Summary>("/api-usage"), refetchInterval: 60_000 });
  const d = q.data;
  const cur = d ? monthName(d.months.thisMonth) : "This month";
  const prev = d ? monthName(d.months.lastMonth) : "Last month";

  return (
    <>
      <PageHeader title="API usage" subtitle="What the CRM uses from outside services, so nothing runs dry or costs more than expected" />
      <div className="space-y-4 px-4 py-4 lg:px-6">
        {q.isPending ? <p className="text-sm text-muted">Loading…</p> : q.isError ? <p className="text-sm text-red-600">{(q.error as Error).message}</p> : (
          <>
            {d!.alerts.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                {d!.alerts.map((a, i) => <li key={i} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{a}</li>)}
              </ul>
            )}

            <div className="card overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">Service</th>
                    <th className="px-4 py-2.5 font-bold">Balance left</th>
                    <th className="px-4 py-2.5 font-bold">Used in {cur}</th>
                    <th className="px-4 py-2.5 font-bold">Used in {prev}</th>
                    <th className="px-4 py-2.5 font-bold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {d!.balances.map((b) => (
                    <tr key={b.service} className="border-b border-line/70 align-top last:border-0">
                      <td className="px-4 py-3 font-semibold text-navy">{b.service}</td>
                      <td className="px-4 py-3 font-bold">{b.balance ?? <span className="font-normal text-muted">Check the provider</span>}</td>
                      <td className="px-4 py-3">{b.usedThisMonth ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">{b.usedLastMonth ?? "—"}</td>
                      <td className="max-w-sm px-4 py-3 text-[12px] text-muted">{b.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Block title="Voice agent calls (Sarvam)" a={`${n(d!.voice.thisMonth.calls)} calls · ${d!.voice.thisMonth.minutes} min`} b={`${n(d!.voice.lastMonth.calls)} calls · ${d!.voice.lastMonth.minutes} min`} aLabel={cur} bLabel={prev} />
              <Block title="WhatsApp messages sent" a={n(d!.whatsapp.thisMonth)} b={n(d!.whatsapp.lastMonth)} aLabel={cur} bLabel={prev} />
              <div className="card p-4">
                <h3 className="text-[12px] font-bold tracking-wide text-muted uppercase">Plivo balance</h3>
                <p className="mt-2 text-lg font-bold text-navy">{d!.plivo.configured ? usd(d!.plivo.balanceUsd) : "Not connected"}</p>
                <p className="text-[11px] text-muted">{d!.plivo.configured ? "Live from Plivo, checked every few minutes" : "Add the Plivo login to the server settings"}</p>
              </div>
            </div>

            <div className="card p-4">
              <h3 className="text-[12px] font-bold tracking-wide text-muted uppercase">Estimated spending</h3>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-lg font-bold text-navy">{inr(d!.spend.thisMonth.sarvamInr)}</p>
                  <p className="text-[11px] text-muted">Sarvam voice calls, {cur}{d!.spend.lastMonth.sarvamInr !== null ? ` (last month ${inr(d!.spend.lastMonth.sarvamInr)})` : ""}</p>
                  {d!.rates.sarvamInrPerMin === null && <p className="text-[11px] text-amber-700">Rate not set: add RATE_SARVAM_INR_PER_MIN on the server.</p>}
                </div>
                <div>
                  <p className="text-lg font-bold text-navy">{inr(d!.spend.thisMonth.whatsappInr)}</p>
                  <p className="text-[11px] text-muted">WhatsApp messages, {cur}{d!.spend.lastMonth.whatsappInr !== null ? ` (last month ${inr(d!.spend.lastMonth.whatsappInr)})` : ""}</p>
                  {d!.rates.whatsappInrPerMessage === null && <p className="text-[11px] text-amber-700">Rate not set: add RATE_WHATSAPP_INR_PER_MESSAGE on the server.</p>}
                </div>
                <div>
                  <p className="text-lg font-bold text-navy">{usd(d!.services.find((s) => s.name === "OpenAI")?.thisMonth.estUsd ?? null)}</p>
                  <p className="text-[11px] text-muted">OpenAI, {cur} (estimate from tokens)</p>
                </div>
              </div>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">Service</th>
                    <th className="px-4 py-2.5 font-bold">{cur}</th>
                    <th className="px-4 py-2.5 font-bold">{prev}</th>
                    <th className="px-4 py-2.5 font-bold">Used for</th>
                  </tr>
                </thead>
                <tbody>
                  {d!.services.map((s) => (
                    <tr key={s.name} className="border-b border-line/70 align-top last:border-0">
                      <td className="px-4 py-3 font-semibold text-navy">{s.name}</td>
                      {[s.thisMonth, s.lastMonth].map((p, i) => (
                        <td key={i} className="px-4 py-3">
                          <p className="font-semibold">{n(p.calls)} requests{p.failed ? <span className="ml-1 text-red-700">({p.failed} failed)</span> : null}</p>
                          {(p.tokensIn > 0 || p.tokensOut > 0) && <p className="text-[12px] text-muted">{n(p.tokensIn + p.tokensOut)} tokens{p.estUsd !== null ? ` · about ${usd(p.estUsd)}` : ""}</p>}
                          {Object.entries(p.operations).length > 0 && <p className="text-[12px] text-muted">{Object.entries(p.operations).map(([k, v]) => `${k} ${n(v)}`).join(" · ")}</p>}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-muted">{WHAT[s.name] ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[12px] text-muted">
              Request counts began {d!.trackingSince ? formatDateTime(d!.trackingSince) : "when this page was first deployed"}; anything before that is not in them. Voice and WhatsApp counts above come from our own records and go further back.
              Costs are estimates from public prices and shown only where the model's price is known. Sarvam's own bill and balance are in Sarvam's dashboard.
            </p>
          </>
        )}
      </div>
    </>
  );
}
