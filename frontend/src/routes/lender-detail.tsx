import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Pencil, Scale, Users } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatCompact } from "../lib/format";
import { percent } from "../lib/lenders";
import type { LenderContact } from "../lib/lender-contacts";
import { PageHeader } from "../components/app-shell";
import { LenderAvatar } from "../components/lender-avatar";
import { LenderContactsModal, ContactLinks } from "../components/lender-contacts";

type Policy = {
  id: string;
  active: boolean;
  minAmount: string | null;
  maxAmount: string | null;
  minTenureMonths: number | null;
  maxTenureMonths: number | null;
  rateType: string | null;
  minRate: string | null;
  maxRate: string | null;
  commissionPercent: string | null;
  loanProduct: { id: string; name: string };
};

type LenderDetail = {
  id: string;
  name: string;
  shortName: string | null;
  type: "BANK" | "NBFC";
  active: boolean;
  isPublic: boolean;
  brokerCode: string | null;
  defaultCommission: string | null;
  portalUrl: string | null;
  branchName: string | null;
  branchCity: string | null;
  branchAddress: string | null;
  notes: string | null;
  applicationCount: number;
  policies: Policy[];
  contacts: Omit<LenderContact, "lender">[];
};

const range = (a: string | null, b: string | null, fmt: (v: string) => string) =>
  a || b ? `${a ? fmt(a) : "Any"} – ${b ? fmt(b) : "Any"}` : "—";

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xl font-bold text-navy">{value}</p>
      <p className="mt-0.5 text-[11px] font-bold tracking-wide text-muted uppercase">{label}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/70 py-2.5 text-[13px] last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold text-navy">{children || "—"}</span>
    </div>
  );
}

export function LenderDetailPage() {
  const { lenderId } = useParams({ strict: false }) as { lenderId: string };
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canPolicies = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [contacts, setContacts] = useState(false);

  const query = useQuery({
    queryKey: ["lender", lenderId],
    queryFn: () => api<LenderDetail>(`/lenders/${lenderId}`),
  });
  const l = query.data;

  if (query.isError) {
    return (
      <>
        <PageHeader title="Lender" />
        <div className="px-6 py-5">
          <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(query.error as Error).message}</p>
          <Link to="/lenders" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to lenders
          </Link>
        </div>
      </>
    );
  }
  if (!l) return <PageHeader title="Lender" subtitle="Loading…" />;

  return (
    <>
      <PageHeader
        title={l.name}
        subtitle={`${l.type === "BANK" ? "Bank" : "NBFC"}${l.shortName ? ` · ${l.shortName}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/lenders" className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> Lenders
            </Link>
            {isAdmin && (
              <Link to="/lenders/$lenderId/edit" params={{ lenderId: l.id }} className="btn-primary">
                <Pencil className="h-4 w-4" /> Edit lender
              </Link>
            )}
          </div>
        }
      />

      <div className="space-y-5 px-6 py-5">
        <section className="card overflow-hidden">
          <div className="flex items-center gap-4 p-5">
            <LenderAvatar name={l.name} type={l.type} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-navy">{l.name}</h2>
                <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-bold", l.active ? "bg-green-50 text-green-700" : "bg-bg-light text-muted")}>
                  {l.active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-[13px] text-muted">{l.isPublic ? "Shown on the website" : "Not shown on the website"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-line/70 border-t border-line/70 lg:grid-cols-4">
            <Stat value={l.policies.length} label="Loan types" />
            <Stat value={l.policies.filter((p) => p.active).length} label="Active loan types" />
            <Stat value={percent(l.defaultCommission)} label="Our commission" />
            <Stat value={l.applicationCount} label="Files" />
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-navy">Loan types offered</h2>
              {canPolicies && (
                <Link to="/lender-policies" className="btn-ghost">
                  <Scale className="h-4 w-4" /> Open lender policies
                </Link>
              )}
            </div>
            {!l.policies.length ? (
              <p className="py-8 text-center text-[13px] text-muted">
                No loan types recorded for this lender yet. Add them from Lender policies, or use Bulk add loan type on the Lenders page.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-line text-[11px] tracking-wide text-muted uppercase">
                    <tr>
                      <th className="py-2 pr-4 font-bold">Loan type</th>
                      <th className="py-2 pr-4 font-bold">Amount</th>
                      <th className="py-2 pr-4 font-bold">Tenure</th>
                      <th className="py-2 pr-4 font-bold">Interest</th>
                      <th className="py-2 pr-4 font-bold">Commission</th>
                      <th className="py-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.policies.map((p) => (
                      <tr key={p.id} className="border-b border-line/70 last:border-0">
                        <td className="py-2.5 pr-4 font-semibold text-navy">{p.loanProduct.name}</td>
                        <td className="py-2.5 pr-4 text-muted">{range(p.minAmount, p.maxAmount, formatCompact)}</td>
                        <td className="py-2.5 pr-4 text-muted">
                          {range(p.minTenureMonths?.toString() ?? null, p.maxTenureMonths?.toString() ?? null, (v) => `${v} mo`)}
                        </td>
                        <td className="py-2.5 pr-4 text-muted">
                          {range(p.minRate, p.maxRate, (v) => `${Number(v)}%`)}
                          {p.rateType && <span className="ml-1 text-[11px]">({p.rateType === "FLOATING" ? "floating" : "fixed"})</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-muted">{percent(p.commissionPercent)}</td>
                        <td className="py-2.5">
                          <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-bold", p.active ? "bg-green-50 text-green-700" : "bg-bg-light text-muted")}>
                            {p.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="space-y-5">
            <section className="card p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-navy">Relationship managers</h2>
                <button onClick={() => setContacts(true)} className="btn-ghost !px-2 !py-1 text-[12px]">
                  <Users className="h-3.5 w-3.5" /> {canPolicies ? "Manage" : "View all"}
                </button>
              </div>
              {!l.contacts.length ? (
                <p className="text-[13px] text-muted">No contacts yet.</p>
              ) : (
                <ul className="divide-y divide-line/70">
                  {l.contacts.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0 text-[13px]">
                        <p className="font-semibold text-navy">{c.name}</p>
                        <p className="text-[12px] text-muted">{[c.designation, c.phone, c.email].filter(Boolean).join(" · ")}</p>
                      </div>
                      <ContactLinks phone={c.phone} email={c.email} />
                    </li>
                  ))}
                  {l.contacts.length > 4 && <li className="pt-2 text-[12px] text-muted">+{l.contacts.length - 4} more</li>}
                </ul>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-1 text-sm font-bold text-navy">Partnership</h2>
              <Row label="Broker code">{l.brokerCode}</Row>
              <Row label="Default commission">{l.defaultCommission ? percent(l.defaultCommission) : null}</Row>
              <Row label="Partner portal">
                {l.portalUrl ? (
                  <a href={l.portalUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-navy hover:underline">
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </Row>
              <Row label="Branch">{[l.branchName, l.branchCity].filter(Boolean).join(", ")}</Row>
              {l.branchAddress && <Row label="Branch address">{l.branchAddress}</Row>}
              {l.notes && <p className="mt-3 rounded-md bg-bg-light px-3 py-2.5 text-[13px] text-muted">{l.notes}</p>}
            </section>
          </div>
        </div>
      </div>

      {contacts && <LenderContactsModal lender={l} onClose={() => setContacts(false)} />}
    </>
  );
}
