import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, Users } from "lucide-react";
import { partnerApi } from "../lib/partner-api";
import { formatDate } from "../lib/format";
import { usePartnerAuth } from "../lib/partner-auth";

type Stats = { totalReferred: number; converted: number; conversionRate: number };

type ReferredLead = {
  id: string;
  leadNo: number;
  name: string;
  status: string;
  createdAt: string;
  loanProduct: { name: string } | null;
};

type RateCard = {
  id: string;
  label: string;
  minRate: string;
  maxRate: string;
  avgAmountLabel: string;
  earningLabel: string;
};

const STATUS_TONE: Record<string, string> = {
  NEW: "bg-navy/8 text-navy",
  CONTACTED: "bg-sky-50 text-sky-700",
  QUALIFIED: "bg-gold-pale text-gold-dark",
  DOCS_PENDING: "bg-amber-50 text-amber-700",
  CONVERTED: "bg-emerald-50 text-emerald-700",
  LOST: "bg-slate-100 text-slate-500",
};

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold-pale text-gold-dark">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
        <p className="text-xl font-bold text-navy">{value}</p>
      </div>
    </div>
  );
}

export function PartnerDashboardPage() {
  const { partner } = usePartnerAuth();

  const stats = useQuery({
    queryKey: ["partner-stats"],
    queryFn: () => partnerApi<Stats>("/partner/stats"),
  });

  const leads = useQuery({
    queryKey: ["partner-leads"],
    queryFn: () => partnerApi<ReferredLead[]>("/partner/leads"),
  });

  const rateCard = useQuery({
    queryKey: ["partner-rate-card"],
    queryFn: () => partnerApi<RateCard[]>("/partner/commission-structure"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-navy">Welcome, {partner?.name.split(" ")[0]}</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Your referrals, conversion and commission structure with GCS.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Your commission rate" value={`${partner?.commissionRate}%`} icon={TrendingUp} />
        {stats.isPending ? (
          <div className="card flex items-center justify-center gap-2 p-4 text-sm text-muted sm:col-span-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <Stat label="Leads referred" value={String(stats.data?.totalReferred ?? 0)} icon={Users} />
            <Stat
              label="Converted"
              value={`${stats.data?.converted ?? 0} (${stats.data?.conversionRate ?? 0}%)`}
              icon={TrendingUp}
            />
          </>
        )}
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-bold text-navy">DSA Partner Commission Structure</h2>
        <p className="mt-1 text-[13px] text-muted">
          Earn attractive commissions on every successful loan disbursement.
        </p>

        {rateCard.isPending ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Loan Product</th>
                  <th className="px-4 py-2.5 font-bold">Commission Range</th>
                  <th className="px-4 py-2.5 font-bold">Avg. Loan Amount</th>
                  <th className="px-4 py-2.5 font-bold">Potential Earning/Deal</th>
                </tr>
              </thead>
              <tbody>
                {rateCard.data?.map((c) => (
                  <tr key={c.id} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2.5 font-semibold text-navy">{c.label}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {c.minRate}% – {c.maxRate}%
                    </td>
                    <td className="px-4 py-2.5 text-muted">{c.avgAmountLabel}</td>
                    <td className="px-4 py-2.5 font-medium text-gold-dark">{c.earningLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted italic">
          Note: Commission rates may vary based on lender, loan amount, and partner tier.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold text-navy">Your referrals</h2>
        {leads.isPending ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !leads.data?.length ? (
          <p className="mt-3 text-[13px] text-muted">
            No referrals yet — leads you're credited for will appear here.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Lead</th>
                  <th className="px-4 py-2.5 font-bold">Product</th>
                  <th className="px-4 py-2.5 font-bold">Referred</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.data.map((l) => (
                  <tr key={l.id} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-navy">{l.name}</p>
                      <p className="text-[11px] text-muted">#{l.leadNo}</p>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{l.loanProduct?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{formatDate(l.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[l.status] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {l.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
