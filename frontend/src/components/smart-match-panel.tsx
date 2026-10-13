import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import type { Lead } from "../lib/types";

type Reason = { code: string; ok: boolean; text: string };
type Result = {
  policyId: string;
  lenderName: string;
  status: "STRONG" | "POSSIBLE" | "EXPERT_REVIEW" | "EXCLUDED";
  score: number | null;
  reasons: Reason[];
  checks: string[];
  policyNeedsReview: boolean;
  policyVersion: number | null;
  exceptions: { scenario: string; requiredApproval: string | null; expertNote: string | null }[];
};
type Run = { id: string; reviewStatus: string; noPolicies?: boolean; results: Result[] };
type SavedRun = { id: string; reviewStatus: string; reviewedByName: string | null; reviewNote: string | null; reviewedAt: string | null; createdAt: string; createdByName: string | null };

const STATUS: Record<Result["status"], { label: string; cls: string }> = {
  STRONG: { label: "Strong match", cls: "bg-emerald-50 text-emerald-700" },
  POSSIBLE: { label: "Possible match", cls: "bg-sky-50 text-sky-700" },
  EXPERT_REVIEW: { label: "Expert review", cls: "bg-amber-50 text-amber-700" },
  EXCLUDED: { label: "Not a fit", cls: "bg-gray-100 text-gray-600" },
};

/** Words the website advisor wrote in the lead's notes → fields the matcher understands. */
function fromNotes(notes: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (notes ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}
const digits = (v?: string) => (v ? v.replace(/[^\d]/g, "") : "");

function prefill(lead: Lead) {
  const n = fromNotes(lead.notes);
  const age = (() => {
    const b = n["age band"] ?? "";
    if (/under 25/i.test(b)) return "23";
    if (/above 55/i.test(b)) return "58";
    const m = b.match(/(\d+)\D+(\d+)/);
    return m ? String(Math.round((Number(m[1]) + Number(m[2])) / 2)) : "";
  })();
  const credit = (() => {
    const b = n["credit score range"] ?? "";
    if (/750/.test(b)) return "750";
    if (/700/.test(b)) return "700";
    if (/650–699|650-699/.test(b)) return "650";
    if (/below 650/i.test(b)) return "600";
    return "";
  })();
  const employment = /salaried/i.test(n["employment"] ?? n["income type"] ?? "") ? "SALARIED" : /self/i.test(n["employment"] ?? n["income type"] ?? "") ? "SELF_EMPLOYED" : "";
  const pt = n["property type"] ?? "";
  return {
    amount: digits(n["amount needed"]) || (lead.amount ? String(Math.round(Number(lead.amount))) : ""),
    city: n["city"] ?? n["business city"] ?? lead.city ?? "",
    employmentType: employment || lead.employmentType || "",
    age,
    monthlyIncome: digits(n["monthly income"]) || (lead.monthlyIncome ? String(Math.round(Number(lead.monthlyIncome))) : ""),
    existingEmi: digits(n["existing monthly emis"]),
    creditScore: credit,
    propertyValue: digits(n["property value"]),
    propertyType: /ready flat|under construction|plot \+/i.test(pt) ? "Residential" : pt.replace(/^not decided yet$/i, ""),
    constitution: n["business type"] ?? "",
    annualTurnover: digits(n["annual turnover"]),
    annualProfit: digits(n["annual net profit"]),
  };
}

const FIELDS: { key: keyof ReturnType<typeof prefill>; label: string; type?: "select" }[] = [
  { key: "amount", label: "Loan needed (₹)" },
  { key: "city", label: "City" },
  { key: "employmentType", label: "Applicant type", type: "select" },
  { key: "age", label: "Age" },
  { key: "monthlyIncome", label: "Monthly income (₹)" },
  { key: "existingEmi", label: "Existing EMIs (₹/month)" },
  { key: "creditScore", label: "Credit score (low end)" },
  { key: "propertyValue", label: "Property value (₹)" },
  { key: "propertyType", label: "Property type" },
  { key: "constitution", label: "Business type" },
  { key: "annualTurnover", label: "Yearly turnover (₹)" },
  { key: "annualProfit", label: "Yearly profit (₹)" },
];

/**
 * Smart match for one lead: the website advisor's answers are already filled in; staff fix or add
 * anything, run it, and see which lenders' recorded rules the profile appears to fit and why.
 * It is a shortlist for a person to check, never an approval.
 */
export function SmartMatchPanel({ lead }: { lead: Lead }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canReview = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [form, setForm] = useState(() => prefill(lead));
  const [run, setRun] = useState<Run | null>(null);
  const [open, setOpen] = useState(false);

  const productId = lead.loanProduct?.id;
  const history = useQuery({
    queryKey: ["match-runs", lead.id],
    queryFn: () => api<SavedRun[]>(`/lender-policies/match/runs?leadId=${lead.id}`),
    enabled: open,
  });

  const go = useMutation({
    mutationFn: () => {
      const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/,/g, "")));
      const profile = {
        amount: num(form.amount),
        city: form.city.trim() || undefined,
        employmentType: form.employmentType || undefined,
        age: num(form.age),
        monthlyIncome: num(form.monthlyIncome),
        existingEmi: num(form.existingEmi),
        creditScore: num(form.creditScore),
        propertyValue: num(form.propertyValue),
        propertyType: form.propertyType.trim() || undefined,
        constitution: form.constitution.trim() || undefined,
        annualTurnover: num(form.annualTurnover),
        annualProfit: num(form.annualProfit),
      };
      return api<Run>("/lender-policies/match", { method: "POST", body: JSON.stringify({ loanProductId: productId, leadId: lead.id, profile }) });
    },
    onSuccess: (r) => {
      setRun(r);
      void queryClient.invalidateQueries({ queryKey: ["match-runs", lead.id] });
    },
  });

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) => api(`/lender-policies/match/runs/${id}/review`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (_d, v) => {
      setRun((r) => (r ? { ...r, reviewStatus: v.status } : r));
      void queryClient.invalidateQueries({ queryKey: ["match-runs", lead.id] });
    },
  });

  const shown = useMemo(() => (run?.results ?? []).filter((r) => r.status !== "EXCLUDED"), [run]);
  const hidden = (run?.results.length ?? 0) - shown.length;

  return (
    <section className="card p-5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy"><Sparkles className="h-4 w-4 text-gold" /> Smart lender match</h2>
        <span className="text-[12px] font-semibold text-muted">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-4">
          {!productId ? (
            <p className="text-[13px] text-muted">Set this lead's loan product first, so the matcher knows which lenders' rules to use.</p>
          ) : (
            <>
              <p className="text-[12px] text-muted">Filled in from the enquiry. Correct anything, add what you know, then run it. Only the rules your team has recorded and checked are used.</p>
              <form
                className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  go.mutate();
                }}
              >
                {FIELDS.map((f) => (
                  <label key={f.key} className="text-[12px] font-semibold text-navy">
                    {f.label}
                    {f.type === "select" ? (
                      <select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="field mt-1 font-normal">
                        <option value="">Not known</option>
                        <option value="SALARIED">Salaried</option>
                        <option value="SELF_EMPLOYED">Self-employed</option>
                      </select>
                    ) : (
                      <input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="field mt-1 font-normal" />
                    )}
                  </label>
                ))}
                <div className="col-span-2 sm:col-span-3">
                  <button className="btn-primary" disabled={go.isPending}>
                    {go.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Run match
                  </button>
                </div>
              </form>
              {go.isError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{(go.error as Error).message}</p>}
            </>
          )}

          {run && (
            <div className="mt-5 space-y-3">
              {run.noPolicies && <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">No lender has rules recorded for this loan product yet. Add them under Lender policies.</p>}
              {shown.map((r) => (
                <article key={r.policyId} className="rounded-lg border border-line p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[14px] font-bold text-navy">{r.lenderName}</h3>
                    <span className="flex items-center gap-2">
                      {r.score !== null && <span className="text-[13px] font-bold text-navy">{r.score}/100</span>}
                      <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 text-[13px]">
                    {r.reasons.map((x, i) => (
                      <li key={i} className={clsx("flex items-start gap-1.5", x.ok ? "text-emerald-800" : "text-red-700")}>
                        {x.ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        {x.text}
                      </li>
                    ))}
                    {r.checks.map((x, i) => (
                      <li key={`c${i}`} className="flex items-start gap-1.5 text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Check: {x}
                      </li>
                    ))}
                  </ul>
                  {r.exceptions.length > 0 && (
                    <div className="mt-2 rounded-md bg-bg-light px-3 py-2 text-[12px] text-muted">
                      <p className="font-semibold text-navy">Known exceptions</p>
                      {r.exceptions.map((x, i) => (
                        <p key={i}>{x.scenario}{x.requiredApproval ? ` — approval: ${x.requiredApproval}` : ""}{x.expertNote ? ` (${x.expertNote})` : ""}</p>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-muted">Based on policy version {r.policyVersion ?? "—"}.</p>
                </article>
              ))}
              {hidden > 0 && <p className="text-[12px] text-muted">{hidden} {hidden === 1 ? "lender was" : "lenders were"} ruled out (location, amount, age or product limits).</p>}
              <p className="text-[12px] text-muted">A shortlist from recorded rules, not an approval. A lender decides after its own checks.</p>
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className="text-[12px] font-semibold text-navy">Customer display: {run.reviewStatus === "APPROVED" ? "approved" : run.reviewStatus === "REJECTED" ? "not approved" : "waiting for review"}</span>
                {canReview && run.reviewStatus === "PENDING" && (
                  <>
                    <button onClick={() => review.mutate({ id: run.id, status: "APPROVED" })} className="btn-ghost">Approve for the customer</button>
                    <button onClick={() => review.mutate({ id: run.id, status: "REJECTED" })} className="btn-ghost">Don't show</button>
                  </>
                )}
              </div>
            </div>
          )}

          {(history.data?.length ?? 0) > 0 && (
            <details className="mt-5 text-[12px] text-muted">
              <summary className="cursor-pointer font-semibold text-navy">Earlier matches ({history.data!.length})</summary>
              <ul className="mt-2 space-y-1">
                {history.data!.map((h) => (
                  <li key={h.id}>
                    {formatDateTime(h.createdAt)} · {h.createdByName ?? "—"} · {h.reviewStatus.toLowerCase()}
                    {h.reviewedByName ? ` by ${h.reviewedByName}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
