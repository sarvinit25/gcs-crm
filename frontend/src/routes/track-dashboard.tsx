import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import { borrowerApi } from "../lib/borrower-api";
import { formatAmount, formatDate } from "../lib/format";

type SanctionView = {
  technicalStatus: string;
  financialStatus: string;
  legalStatus: string;
  sanctionedAmount: string | null;
  interestRate: string | null;
  tenureMonths: number | null;
  validTill: string | null;
} | null;

type MyApplication = {
  applicationNo: string;
  status: string;
  loanProduct: string;
  lender: string | null;
  requestedAmount: string;
  tenureMonths: number | null;
  createdAt: string;
  advisor: string | null;
  bankLogin: { done: boolean; at: string | null; bankReferenceNo: string | null };
  sanction: SanctionView;
  disbursements: { type: string; amount: string; disbursedAt: string }[];
  disbursedTotal: number;
};

const STAGES = [
  { key: "SUBMITTED", label: "Submitted" },
  { key: "BANK_LOGIN", label: "Bank Login" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "SANCTIONED", label: "Sanctioned" },
  { key: "DISBURSED", label: "Disbursed" },
];

function Stepper({ status }: { status: string }) {
  if (status === "REJECTED" || status === "WITHDRAWN") {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
        This application was {status === "REJECTED" ? "rejected" : "withdrawn"}.
      </div>
    );
  }

  const currentIndex = Math.max(0, STAGES.findIndex((s) => s.key === status));

  return (
    <ol className="grid grid-cols-5 gap-1">
      {STAGES.map((s, i) => {
        const done = i <= currentIndex;
        return (
          <li key={s.key} className="flex flex-col items-center gap-1.5 text-center">
            <span
              className={clsx(
                "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold",
                done ? "bg-navy text-white" : "bg-line text-muted",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={clsx("text-[10px] font-semibold", done ? "text-navy" : "text-muted")}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-0.5 text-[13px] text-ink">{value}</p>
    </div>
  );
}

const SANCTION_LEG_LABEL: Record<string, string> = {
  technicalStatus: "Technical",
  financialStatus: "Financial",
  legalStatus: "Legal",
};

export function TrackDashboardPage() {
  const query = useQuery({
    queryKey: ["borrower-me"],
    queryFn: () => borrowerApi<MyApplication>("/borrower/me"),
  });

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (query.isError) {
    return <p className="py-16 text-center text-sm text-red-600">{(query.error as Error).message}</p>;
  }

  const app = query.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-navy">{app.loanProduct}</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {app.applicationNo} · Applied {formatDate(app.createdAt)}
          {app.advisor && ` · Advisor: ${app.advisor}`}
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-bold text-navy">Status</h2>
        <Stepper status={app.status} />
      </section>

      <section className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
        <Fact label="Requested amount" value={formatAmount(app.requestedAmount)} />
        <Fact label="Tenure" value={app.tenureMonths ? `${app.tenureMonths} months` : "—"} />
        <Fact label="Lender" value={app.lender ?? "Not yet assigned"} />
        <Fact
          label="Bank login"
          value={app.bankLogin.done ? formatDate(app.bankLogin.at) : "Pending"}
        />
        <Fact label="Bank reference" value={app.bankLogin.bankReferenceNo ?? "—"} />
      </section>

      {app.sanction && (
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-bold text-navy">Sanction</h2>
          <div className="grid grid-cols-3 gap-3">
            {(["technicalStatus", "financialStatus", "legalStatus"] as const).map((k) => (
              <div
                key={k}
                className={clsx(
                  "rounded-lg px-3 py-2.5 text-center",
                  app.sanction![k] === "APPROVED"
                    ? "bg-emerald-50 text-emerald-700"
                    : app.sanction![k] === "REJECTED"
                      ? "bg-red-50 text-red-700"
                      : "bg-bg-light text-muted",
                )}
              >
                <p className="text-[10px] font-bold tracking-wide uppercase">
                  {SANCTION_LEG_LABEL[k]}
                </p>
                <p className="mt-1 text-[13px] font-semibold">{app.sanction![k]}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Fact label="Sanctioned amount" value={formatAmount(app.sanction.sanctionedAmount)} />
            <Fact
              label="Interest rate"
              value={app.sanction.interestRate ? `${app.sanction.interestRate}%` : "—"}
            />
            <Fact label="Valid till" value={formatDate(app.sanction.validTill)} />
          </div>
        </section>
      )}

      {app.disbursements.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-bold text-navy">Disbursements</h2>
          <p className="mb-4 text-[13px] text-muted">
            {formatAmount(app.disbursedTotal)} disbursed of{" "}
            {formatAmount(app.sanction?.sanctionedAmount ?? app.requestedAmount)}
          </p>
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Type</th>
                  <th className="px-4 py-2.5 font-bold">Amount</th>
                  <th className="px-4 py-2.5 font-bold">Date</th>
                </tr>
              </thead>
              <tbody>
                {app.disbursements.map((d, i) => (
                  <tr key={i} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2.5 text-muted">{d.type}</td>
                    <td className="px-4 py-2.5 font-semibold text-navy">{formatAmount(d.amount)}</td>
                    <td className="px-4 py-2.5 text-muted">{formatDate(d.disbursedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
