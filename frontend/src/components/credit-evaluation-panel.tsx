import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, Plus, Printer, ShieldCheck, Trash2, XCircle } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatAmount, formatCompact, formatDate } from "../lib/format";
import { EMPLOYMENT_TYPE_LABEL, CONSTITUTION_LABEL, type ApplicantConstitution, type EmploymentType } from "../lib/types";

type CheckStatus = "OK" | "WATCH" | "FAIL" | "UNKNOWN";
type Check = { key: string; label: string; status: CheckStatus; detail: string };
type Loan = { id: string; applicantId: string | null; lenderName: string; loanType: string | null; outstanding: number | null; emi: number; monthsLeft: number | null; counted: boolean; note: string | null };

type Evaluation = {
  application: { id: string; applicationNo: string; status: string };
  profile: "SALARIED" | "BUSINESS" | "OTHER";
  secured: boolean;
  loanProduct: string;
  applicants: {
    id: string;
    name: string;
    isPrimary: boolean;
    pan: string | null;
    phone: string | null;
    email: string | null;
    aadhaarLast4: string | null;
    employmentType: EmploymentType | null;
    constitution: ApplicantConstitution | null;
    employerName: string | null;
    monthlyIncome: number | null;
    cibilScore: number | null;
    cibilScoreDate: string | null;
  }[];
  sourcedBy: string;
  assignedTo: string | null;
  purpose: string | null;
  createdAt: string;
  inputs: Record<string, number | null>;
  remarks: string | null;
  existingLoans: Loan[];
  assessed: { amount: number; rate: number | null; tenure: number | null };
  results: {
    proposedEmi: number | null;
    existingEmi: number;
    income: { monthly: number; source: "entered" | "applicants" | "profit" | null };
    foir: { value: number | null; max: number; room: number | null; eligibleAmount: number | null };
    dscr: { value: number | null; min: number; annualDebtService: number };
    bto: { annual: number | null; declared: number | null; variancePercent: number | null };
    gst: { annual: number | null; declared: number | null; variancePercent: number | null; allowed: number };
    ltv: { value: number | null; max: number };
  };
  checks: Check[];
  readiness: { ok: number; watch: number; fail: number; unknown: number };
  decision: { decision: "READY" | "REJECTED"; note: string | null; at: string; by: string | null } | null;
};

const TABS = [
  ["overview", "Overview"],
  ["loans", "Existing loans"],
  ["calc", "Calculations"],
  ["summary", "Summary & decision"],
  ["cam", "CAM report"],
] as const;
type Tab = (typeof TABS)[number][0];

const STATUS_STYLE: Record<CheckStatus, { chip: string; label: string; icon: typeof CheckCircle2 }> = {
  OK: { chip: "bg-green-50 text-green-700", label: "OK", icon: CheckCircle2 },
  WATCH: { chip: "bg-amber-50 text-amber-800", label: "Watch", icon: AlertTriangle },
  FAIL: { chip: "bg-red-50 text-red-700", label: "Fails", icon: XCircle },
  UNKNOWN: { chip: "bg-bg-light text-muted", label: "Not enough data", icon: CircleHelp },
};

const BLOCK = "grid content-start gap-1 text-[12px] font-semibold text-navy";
const INCOME_SOURCE = { entered: "as entered", applicants: "the applicants' incomes on the file", profit: "worked out from net profit" } as const;

function StatusChip({ status }: { status: CheckStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", s.chip)}>
      <s.icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

function Tile({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-bg-light/60 px-3 py-2.5">
      <p className="text-[10px] font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className={clsx("mt-0.5 text-[13px] font-semibold break-words", warn ? "text-red-600" : "text-navy")}>{children || "—"}</p>
    </div>
  );
}

function Heading({ children }: { children: string }) {
  return <p className="mt-4 mb-2 text-[11px] font-bold tracking-wide text-muted uppercase first:mt-0">{children}</p>;
}

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatAmount(n));
const pct = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "—" : `${n.toFixed(d).replace(/\.0+$/, "")}%`);

export function CreditEvaluationPanel({ applicationId }: { applicationId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canDecide = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [tab, setTab] = useState<Tab>("overview");

  const query = useQuery({
    queryKey: ["credit-evaluation", applicationId],
    queryFn: () => api<Evaluation>(`/applications/${applicationId}/credit-evaluation`),
  });

  const refresh = (view: Evaluation) => {
    queryClient.setQueryData(["credit-evaluation", applicationId], view);
    void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    void queryClient.invalidateQueries({ queryKey: ["applications"] });
  };
  const call = <T,>(path: string, method: string, body?: unknown) =>
    api<T>(`/applications/${applicationId}/credit-evaluation${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => call<Evaluation>("", "PUT", body), onSuccess: refresh });
  const addLoan = useMutation({ mutationFn: (body: Record<string, unknown>) => call<Evaluation>("/loans", "POST", body), onSuccess: refresh });
  const patchLoan = useMutation({ mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => call<Evaluation>(`/loans/${id}`, "PATCH", body), onSuccess: refresh });
  const removeLoan = useMutation({ mutationFn: (id: string) => call<Evaluation>(`/loans/${id}`, "DELETE"), onSuccess: refresh });
  const decide = useMutation({ mutationFn: (body: Record<string, unknown>) => call<Evaluation>("/decision", "POST", body), onSuccess: refresh });

  const ev = query.data;
  const error = [save, addLoan, patchLoan, removeLoan].find((m) => m.isError)?.error as Error | undefined;

  return (
    <section className="card p-5" id="credit">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-navy">Credit evaluation</h2>
          <p className="text-[12px] text-muted">
            {ev ? `${ev.profile === "SALARIED" ? "Salaried" : ev.profile === "BUSINESS" ? "Business / self-employed" : "Profile not set"} · ${ev.loanProduct}${ev.secured ? " · secured" : ""}` : "Checks the file before it goes to a lender"}
          </p>
        </div>
        {ev?.decision && (
          <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-bold", ev.decision.decision === "READY" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
            {ev.decision.decision === "READY" ? "Cleared for login" : "Rejected in-house"}
          </span>
        )}
      </div>

      <div className="no-print mb-4 flex flex-wrap gap-1.5 border-b border-line pb-3" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={clsx("rounded-lg px-3 py-1.5 text-[13px] font-semibold transition", tab === key ? "bg-navy text-white" : "text-muted hover:bg-bg-light hover:text-navy")}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error.message}</p>}
      {query.isPending && (
        <p className="flex items-center gap-2 py-8 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      )}
      {query.isError && <p className="text-[13px] text-red-600">{(query.error as Error).message}</p>}

      {ev && tab === "overview" && <Overview ev={ev} />}
      {ev && tab === "loans" && <Loans ev={ev} add={addLoan} patch={patchLoan} remove={removeLoan} />}
      {ev && tab === "calc" && <Calculations key={JSON.stringify(ev.inputs)} ev={ev} save={save} />}
      {ev && tab === "summary" && <Summary ev={ev} save={save} decide={decide} canDecide={canDecide} />}
      {ev && tab === "cam" && <Cam ev={ev} />}
    </section>
  );
}

function Overview({ ev }: { ev: Evaluation }) {
  const primary = ev.applicants.find((a) => a.isPrimary) ?? ev.applicants[0];
  return (
    <div>
      <Heading>Identity</Heading>
      <div className="space-y-3">
        {ev.applicants.map((a) => (
          <div key={a.id} className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Tile label={a.isPrimary ? "Applicant" : "Co-applicant"}>{a.name}</Tile>
            <Tile label="PAN number" warn={!a.pan}>
              {a.pan ?? "Not provided"}
            </Tile>
            <Tile label="Aadhaar (last 4)">{a.aadhaarLast4}</Tile>
            <Tile label="CIBIL score">{a.cibilScore ? `${a.cibilScore}${a.cibilScoreDate ? ` · ${formatDate(a.cibilScoreDate)}` : ""}` : "Not recorded"}</Tile>
            <Tile label="Mobile">{a.phone}</Tile>
            <Tile label="Email">{a.email}</Tile>
            <Tile label="Employment">{a.employmentType ? EMPLOYMENT_TYPE_LABEL[a.employmentType] : null}</Tile>
            <Tile label="Monthly income">{a.monthlyIncome ? formatAmount(a.monthlyIncome) : null}</Tile>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">
        CIBIL scores are pulled or recorded on the <Link to="/cibil" className="font-semibold text-navy underline">CIBIL page</Link>.
      </p>

      <Heading>Loan</Heading>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Tile label="File number">{ev.application.applicationNo}</Tile>
        <Tile label="Loan type">{ev.loanProduct}</Tile>
        <Tile label="Amount assessed">{formatAmount(ev.assessed.amount)}</Tile>
        <Tile label="Purpose">{ev.purpose}</Tile>
      </div>

      {primary && (primary.constitution || primary.employerName) && (
        <>
          <Heading>Business</Heading>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Tile label="Entity type">{primary.constitution ? CONSTITUTION_LABEL[primary.constitution] : null}</Tile>
            <Tile label="Employer / business">{primary.employerName}</Tile>
          </div>
        </>
      )}

      <Heading>Internal</Heading>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Tile label="Sourced by">{ev.sourcedBy}</Tile>
        <Tile label="Assigned to">{ev.assignedTo}</Tile>
        <Tile label="Created on">{formatDate(ev.createdAt)}</Tile>
        <Tile label="Stage">{ev.application.status.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Tile>
      </div>
    </div>
  );
}

function Loans({
  ev,
  add,
  patch,
  remove,
}: {
  ev: Evaluation;
  add: ReturnType<typeof useMutation<Evaluation, Error, Record<string, unknown>>>;
  patch: ReturnType<typeof useMutation<Evaluation, Error, { id: string } & Record<string, unknown>>>;
  remove: ReturnType<typeof useMutation<Evaluation, Error, string>>;
}) {
  const [adding, setAdding] = useState(false);
  const who = (id: string | null) => ev.applicants.find((a) => a.id === id)?.name ?? "Household";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          Loans and cards already running. Their EMIs come off the income when working out what the new loan can be.
          <span className="ml-1 font-semibold text-navy">Counted now: {money(ev.results.existingEmi)} a month.</span>
        </p>
        <button onClick={() => setAdding(!adding)} className="btn-ghost">
          <Plus className="h-4 w-4" /> Add existing loan
        </button>
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const n = (k: string) => (String(f.get(k) ?? "").trim() ? Number(f.get(k)) : null);
            add.mutate(
              {
                lenderName: String(f.get("lenderName")).trim(),
                loanType: String(f.get("loanType")).trim() || null,
                applicantId: String(f.get("applicantId")) || null,
                emi: n("emi") ?? 0,
                outstanding: n("outstanding"),
                monthsLeft: n("monthsLeft"),
                counted: f.get("counted") === "on",
              },
              { onSuccess: () => setAdding(false) },
            );
          }}
          className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-line p-3 xl:grid-cols-4"
        >
          <label className={`${BLOCK} col-span-2`}>
            Lender
            <input name="lenderName" required minLength={2} placeholder="Bank, NBFC or card issuer" className="field font-normal" />
          </label>
          <label className={BLOCK}>
            Type
            <input name="loanType" placeholder="Car loan, credit card…" className="field font-normal" />
          </label>
          <label className={BLOCK}>
            Whose
            <select name="applicantId" defaultValue="" className="field font-normal">
              <option value="">Household</option>
              {ev.applicants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className={BLOCK}>
            EMI a month (₹)
            <input name="emi" type="number" min={0} required className="field font-normal" />
          </label>
          <label className={BLOCK}>
            Outstanding (₹)
            <input name="outstanding" type="number" min={0} className="field font-normal" />
          </label>
          <label className={BLOCK}>
            Months left
            <input name="monthsLeft" type="number" min={0} className="field font-normal" />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] font-semibold text-navy">
            <input name="counted" type="checkbox" defaultChecked /> Count its EMI
          </label>
          <div className="flex justify-end gap-2 col-span-full">
            <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="submit" disabled={add.isPending} className="btn-primary">
              {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Add
            </button>
          </div>
        </form>
      )}

      {!ev.existingLoans.length ? (
        <p className="rounded-lg bg-bg-light/60 px-4 py-8 text-center text-[13px] text-muted">None recorded. Confirm with the customer that there are no running loans or cards.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2 font-bold">Lender</th>
                <th className="px-3 py-2 font-bold">Whose</th>
                <th className="px-3 py-2 font-bold">EMI</th>
                <th className="px-3 py-2 font-bold">Outstanding</th>
                <th className="px-3 py-2 font-bold">Months left</th>
                <th className="px-3 py-2 font-bold">Counted</th>
                <th className="px-3 py-2 font-bold" />
              </tr>
            </thead>
            <tbody>
              {ev.existingLoans.map((l) => (
                <tr key={l.id} className="border-b border-line/70 last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-navy">{l.lenderName}</p>
                    {l.loanType && <p className="text-[12px] text-muted">{l.loanType}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{who(l.applicantId)}</td>
                  <td className="px-3 py-2.5 font-semibold">{money(l.emi)}</td>
                  <td className="px-3 py-2.5 text-muted">{money(l.outstanding)}</td>
                  <td className="px-3 py-2.5 text-muted">{l.monthsLeft ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={l.counted} onChange={() => patch.mutate({ id: l.id, counted: !l.counted })} aria-label={`Count ${l.lenderName}'s EMI`} title="Off when it will be closed before the new loan is logged in" />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => window.confirm(`Remove ${l.lenderName} from this file?`) && remove.mutate(l.id)}
                      className="rounded p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${l.lenderName}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Calculations({ ev, save }: { ev: Evaluation; save: ReturnType<typeof useMutation<Evaluation, Error, Record<string, unknown>>> }) {
  const r = ev.results;
  const input = (key: string) => ev.inputs[key] ?? "";
  const field = (key: string, label: string, hint?: string, step?: string) => (
    <label className={BLOCK} key={key}>
      {label}
      <input name={key} type="number" step={step} defaultValue={input(key)} className="field font-normal" />
      {hint && <span className="text-[11px] font-normal text-muted">{hint}</span>}
    </label>
  );
  const business = ev.profile === "BUSINESS";
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const body: Record<string, number | null> = {};
          for (const [k] of f.entries()) body[k] = String(f.get(k)).trim() ? Number(f.get(k)) : null;
          save.mutate(body);
        }}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <p className="text-[11px] font-bold tracking-wide text-muted uppercase col-span-full">The loan being assessed</p>
        {field("loanAmount", "Loan amount (₹)", `Blank uses ${formatCompact(ev.assessed.amount)}, the sanctioned or requested amount.`)}
        {field("proposedRate", "Interest rate (% a year)", "Needed for the EMI.", "0.01")}
        {field("tenureMonths", "Tenure (months)", ev.assessed.tenure ? `Using ${ev.assessed.tenure}.` : "Needed for the EMI.")}

        <p className="mt-1 text-[11px] font-bold tracking-wide text-muted uppercase col-span-full">Income</p>
        {field("monthlyIncome", "Net monthly income (₹)", r.income.source ? `Using ${money(r.income.monthly)}, ${INCOME_SOURCE[r.income.source]}.` : "Not known yet. Enter it, or fill the applicant's income.")}

        {business && (
          <>
            <p className="mt-1 text-[11px] font-bold tracking-wide text-muted uppercase col-span-full">Business figures (a year)</p>
            {field("annualTurnover", "Turnover as stated (₹)")}
            {field("netProfit", "Net profit (₹)")}
            {field("depreciation", "Depreciation (₹)")}
            {field("interestPaid", "Interest paid (₹)")}
            {field("avgMonthlyBankCredits", "Average monthly bank credits (₹)", "From the bank statements.")}
            {field("gstAnnualTurnover", "GST turnover (₹)", "From the GST returns.")}
          </>
        )}

        {ev.secured && (
          <>
            <p className="mt-1 text-[11px] font-bold tracking-wide text-muted uppercase col-span-full">Security</p>
            {field("propertyValue", "Property value (₹)", "From the valuation.")}
          </>
        )}

        <div className="flex justify-end col-span-full">
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save and recalculate
          </button>
        </div>
      </form>

      <Heading>Results</Heading>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Tile label="Proposed EMI">{r.proposedEmi ? money(r.proposedEmi) : "Enter rate and tenure"}</Tile>
        <Tile label="Existing EMIs counted">{money(r.existingEmi)}</Tile>
        <Tile label={`FOIR (ceiling ${r.foir.max}%)`} warn={r.foir.value !== null && r.foir.value > r.foir.max}>
          {pct(r.foir.value)}
        </Tile>
        <Tile label="Loan the income can carry">{r.foir.eligibleAmount !== null ? money(r.foir.eligibleAmount) : "—"}</Tile>
        {business && (
          <>
            <Tile label={`DSCR (floor ${r.dscr.min})`} warn={r.dscr.value !== null && r.dscr.value < r.dscr.min}>
              {r.dscr.value !== null ? r.dscr.value.toFixed(2) : "—"}
            </Tile>
            <Tile label="Bank turnover (a year)">{r.bto.annual !== null ? `${money(r.bto.annual)}${r.bto.variancePercent !== null ? ` · ${pct(r.bto.variancePercent)} vs stated` : ""}` : "—"}</Tile>
            <Tile label="GST turnover">{r.gst.annual !== null ? `${money(r.gst.annual)}${r.gst.variancePercent !== null ? ` · ${pct(r.gst.variancePercent)} vs stated` : ""}` : "—"}</Tile>
          </>
        )}
        {ev.secured && (
          <Tile label={`LTV (ceiling ${r.ltv.max}%)`} warn={r.ltv.value !== null && r.ltv.value > r.ltv.max}>
            {pct(r.ltv.value)}
          </Tile>
        )}
      </div>
      <p className="mt-2 text-[12px] text-muted">The ceilings and floors are set under Settings → Credit checks. Each lender's own limits are on Lender policies.</p>
    </div>
  );
}

function Summary({
  ev,
  save,
  decide,
  canDecide,
}: {
  ev: Evaluation;
  save: ReturnType<typeof useMutation<Evaluation, Error, Record<string, unknown>>>;
  decide: ReturnType<typeof useMutation<Evaluation, Error, Record<string, unknown>>>;
  canDecide: boolean;
}) {
  const [action, setAction] = useState<"READY" | "REJECTED" | null>(null);
  const [note, setNote] = useState("");
  const [remarks, setRemarks] = useState(ev.remarks ?? "");
  const rd = ev.readiness;
  const failing = ev.checks.some((c) => c.status === "FAIL");
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-[12px] font-bold">
        <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-700">{rd.ok} OK</span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{rd.watch} to watch</span>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{rd.fail} failing</span>
        <span className="rounded-full bg-bg-light px-2.5 py-1 text-muted">{rd.unknown} not enough data</span>
      </div>
      <ul className="divide-y divide-line/70 rounded-lg border border-line">
        {ev.checks.map((c) => (
          <li key={c.key} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-navy">{c.label}</p>
              <p className="text-[12px] text-muted">{c.detail}</p>
            </div>
            <StatusChip status={c.status} />
          </li>
        ))}
      </ul>

      <label className={`${BLOCK} mt-4`}>
        Evaluation remarks
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} maxLength={2000} placeholder="What the appraiser noticed, conditions to meet, who to speak to…" className="field font-normal" />
      </label>
      <div className="mt-2 flex justify-end">
        <button onClick={() => save.mutate({ remarks })} disabled={save.isPending || remarks === (ev.remarks ?? "")} className="btn-ghost">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save remarks
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-line p-4">
        <h3 className="text-[13px] font-bold text-navy">Decision</h3>
        {ev.decision && (
          <p className="mt-1 text-[13px] text-muted">
            {ev.decision.decision === "READY" ? "Cleared for login" : "Rejected in-house"} by {ev.decision.by ?? "staff"} on {formatDate(ev.decision.at)}
            {ev.decision.note ? ` — “${ev.decision.note}”` : ""}.
          </p>
        )}
        {!canDecide ? (
          <p className="mt-2 text-[13px] text-muted">Clearing or rejecting a file is done by an admin or manager.</p>
        ) : (
          <>
            {decide.isError && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(decide.error as Error).message}</p>}
            {!action ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setAction("REJECTED")} className="btn-ghost text-red-700">
                  <XCircle className="h-4 w-4" /> In-house reject
                </button>
                <button onClick={() => setAction("READY")} className="btn-primary">
                  <ShieldCheck className="h-4 w-4" /> Ready to login
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <label className={BLOCK}>
                  {action === "READY" ? "Note (optional)" : "Why is it being rejected?"}
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className="field font-normal" />
                </label>
                {action === "READY" && failing && <p className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">A check is still failing. Clearing the file anyway is recorded as a knowing decision.</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => decide.mutate({ decision: action, note, acknowledgeRisks: action === "READY" && failing }, { onSuccess: () => { setAction(null); setNote(""); } })}
                    disabled={decide.isPending || (action === "REJECTED" && !note.trim())}
                    className={action === "READY" ? "btn-primary" : "btn-primary !bg-red-700"}
                  >
                    {decide.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {action === "READY" ? (failing ? "Clear it anyway" : "Confirm ready to login") : "Confirm rejection"}
                  </button>
                  <button onClick={() => { setAction(null); decide.reset(); }} className="btn-ghost">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The credit appraisal memo: everything above on one page, ready to print or save as PDF. */
function Cam({ ev }: { ev: Evaluation }) {
  const primary = ev.applicants.find((a) => a.isPrimary) ?? ev.applicants[0];
  const r = ev.results;
  const print = () => {
    document.body.classList.add("print-cam");
    const done = () => {
      document.body.classList.remove("print-cam");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };
  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 border-b border-line/70 py-1.5 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold break-words text-navy">{value || "—"}</dd>
    </div>
  );
  return (
    <div>
      <div className="no-print mb-3 flex justify-end">
        <button onClick={print} className="btn-primary">
          <Printer className="h-4 w-4" /> Print or save as PDF
        </button>
      </div>
      <article id="cam-report" className="rounded-lg border border-line bg-white p-6 text-[13px]">
        <header className="mb-4 border-b border-line pb-3">
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">Growth Capital Services · Credit appraisal memo</p>
          <h3 className="mt-1 text-lg font-bold text-navy">{primary?.name ?? "Applicant"} — {ev.loanProduct}</h3>
          <p className="text-muted">
            {ev.application.applicationNo} · prepared {formatDate(new Date().toISOString())}
          </p>
        </header>

        <h4 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Applicants</h4>
        <dl className="mb-4">
            {ev.applicants.map((a) => row(a.isPrimary ? "Main applicant" : "Co-applicant", `${a.name} · PAN ${a.pan ?? "not provided"} · CIBIL ${a.cibilScore ?? "not recorded"}${a.monthlyIncome ? ` · income ${formatAmount(a.monthlyIncome)} a month` : ""}`))}
          </dl>

        <h4 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Loan</h4>
        <dl className="mb-4">
            {row("Amount assessed", formatAmount(ev.assessed.amount))}
            {row("Interest rate and tenure", ev.assessed.rate && ev.assessed.tenure ? `${ev.assessed.rate}% for ${ev.assessed.tenure} months` : null)}
            {row("Proposed EMI", r.proposedEmi ? formatAmount(r.proposedEmi) : null)}
            {row("Purpose", ev.purpose)}
          </dl>

        <h4 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Obligations</h4>
        <dl className="mb-4">
            {ev.existingLoans.length
              ? ev.existingLoans.map((l) => row(`${l.lenderName}${l.loanType ? ` (${l.loanType})` : ""}`, `${formatAmount(l.emi)} a month${l.counted ? "" : " · not counted, closing first"}`))
              : row("Existing loans", "None recorded")}
            {row("EMIs counted", `${formatAmount(r.existingEmi)} a month`)}
          </dl>

        <h4 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Ratios</h4>
        <dl className="mb-4">
            {row("FOIR", r.foir.value !== null ? `${pct(r.foir.value)} (ceiling ${r.foir.max}%)` : null)}
            {ev.profile === "BUSINESS" && row("DSCR", r.dscr.value !== null ? `${r.dscr.value.toFixed(2)} (floor ${r.dscr.min})` : null)}
            {ev.profile === "BUSINESS" && row("Bank turnover vs stated", r.bto.variancePercent !== null ? pct(r.bto.variancePercent) : null)}
            {ev.profile === "BUSINESS" && row("GST turnover vs stated", r.gst.variancePercent !== null ? pct(r.gst.variancePercent) : null)}
            {ev.secured && row("LTV", r.ltv.value !== null ? `${pct(r.ltv.value)} (ceiling ${r.ltv.max}%)` : null)}
          </dl>

        <h4 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Checks</h4>
        <dl className="mb-4">{ev.checks.map((c) => row(c.label, `${STATUS_STYLE[c.status].label} — ${c.detail}`))}</dl>

        {ev.remarks && (
          <>
            <h4 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Remarks</h4>
            <p className="mb-4 whitespace-pre-wrap">{ev.remarks}</p>
          </>
        )}

        <h4 className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Decision</h4>
        <p>
          {ev.decision
            ? `${ev.decision.decision === "READY" ? "Cleared for login" : "Rejected in-house"} by ${ev.decision.by ?? "staff"} on ${formatDate(ev.decision.at)}${ev.decision.note ? ` — ${ev.decision.note}` : ""}.`
            : "Not yet decided."}
        </p>
      </article>
    </div>
  );
}
