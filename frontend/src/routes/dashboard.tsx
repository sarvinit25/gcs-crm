import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { formatAmount } from "../lib/format";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "../lib/types";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/app-shell";

type Summary = {
  leads: { total: number; dueFollowUps: number; byStatus: Record<string, number> };
  applications: number;
  sanctions: number;
  disbursements: { count: number; amount: string | number };
  commissionEarned: string | number;
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "alert" }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-bold ${tone === "alert" ? "text-red-600" : "text-navy"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Summary>("/dashboard/summary"),
  });

  return (
    <>
      <PageHeader
        title={`Welcome, ${user?.name.split(" ")[0]}`}
        subtitle={
          user?.role === "ADVISOR" ? "Your pipeline at a glance" : "Whole-firm pipeline at a glance"
        }
      />

      <div className="px-6 py-5">
        {query.isPending ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : query.isError ? (
          <p className="py-16 text-center text-sm text-red-600">{(query.error as Error).message}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Stat label="Leads" value={String(query.data.leads.total)} />
              <Stat label="Applications" value={String(query.data.applications)} />
              <Stat label="Sanctions" value={String(query.data.sanctions)} />
              <Stat
                label="Disbursed"
                value={formatAmount(query.data.disbursements.amount)}
              />
              <Stat label="Commission" value={formatAmount(query.data.commissionEarned)} />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
              <section className="card p-5">
                <h2 className="text-sm font-bold text-navy">Lead pipeline</h2>
                <div className="mt-4 space-y-2.5">
                  {LEAD_STATUSES.map((status) => {
                    const count = query.data.leads.byStatus[status] ?? 0;
                    const pct = query.data.leads.total
                      ? (count / query.data.leads.total) * 100
                      : 0;
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 text-[12px] text-muted">
                          {LEAD_STATUS_LABEL[status]}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-light">
                          <div
                            className="h-full rounded-full bg-navy transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-[12px] font-semibold text-navy">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="card p-5">
                <h2 className="text-sm font-bold text-navy">Needs attention</h2>
                <p className="mt-3 text-3xl font-bold text-red-600">
                  {query.data.leads.dueFollowUps}
                </p>
                <p className="text-[13px] text-muted">follow-ups due or overdue</p>
                <Link to="/leads" className="btn-ghost mt-4 w-full">
                  Open leads
                </Link>
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
