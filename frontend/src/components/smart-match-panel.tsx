import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { FieldInputs } from "./match-fields-ui";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import type { Lead } from "../lib/types";
import { ReviewModal } from "../routes/lender-offers";

type Reason = { code: string; ok: boolean; text: string };
type Result = {
  policyId: string;
  lenderName: string;
  status: "STRONG" | "POSSIBLE" | "EXPERT_REVIEW" | "EXCLUDED";
  score: number | null;
  reasons: Reason[];
  checks: string[];
  policyNeedsReview: boolean;
  capped?: boolean;
  /** Eligible, Conditional or Not matched. Older saved runs do not have it, so it is worked out the same way here. */
  category?: "ELIGIBLE" | "CONDITIONAL" | "NOT_MATCHED";
  /** Each of the lender's named programs judged on its own rules (older saved runs do not have it). */
  programFit?: { name: string; verdict: "FITS" | "MAYBE" | "MISSES"; ok: string[]; gaps: string[]; needs: string[]; unconfirmed: string[]; indicative?: { amount: number | null; parts: { label: string; amount: number }[]; note: string } | null }[];
  policyVersion: number | null;
  exceptions: { scenario: string; requiredApproval: string | null; expertNote: string | null }[];
  /** What a person should read beside the score. Older saved runs do not have it. */
  details?: {
    notes: string | null; specialScheme: string | null; source: string | null;
    sheet: { label: string; value: string }[];
    flyer: { id: string; name: string; date: string; hasFile: boolean } | null;
  };
};
type Run = { id: string; reviewStatus: string; noPolicies?: boolean; results: Result[]; missingFields?: { key: string; label: string }[] };
type SavedRun = { id: string; reviewStatus: string; reviewedByName: string | null; reviewNote: string | null; reviewedAt: string | null; createdAt: string; createdByName: string | null };

const STATUS: Record<Result["status"], { label: string; cls: string }> = {
  STRONG: { label: "Strong match", cls: "bg-emerald-50 text-emerald-700" },
  POSSIBLE: { label: "Possible match", cls: "bg-sky-50 text-sky-700" },
  EXPERT_REVIEW: { label: "Expert review", cls: "bg-amber-50 text-amber-700" },
  EXCLUDED: { label: "Not a fit", cls: "bg-gray-100 text-gray-600" },
};

const CATEGORY = {
  ELIGIBLE: { label: "Eligible", cls: "bg-emerald-50 text-emerald-700", help: "Everything we could check is met, on rules your team has confirmed." },
  CONDITIONAL: { label: "Conditional", cls: "bg-amber-50 text-amber-700", help: "Could suit, but something must be cleared first: a rule not yet confirmed, a missing detail, or a policy exception." },
  NOT_MATCHED: { label: "Not matched", cls: "bg-gray-100 text-gray-600", help: "A criterion on confirmed rules is not met." },
} as const;
const categoryOf = (r: Result): keyof typeof CATEGORY => {
  if (r.category) return r.category;
  if (r.status === "EXCLUDED") return "NOT_MATCHED";
  if (r.reasons.some((x) => !x.ok && !["PRICING", "LOCATION_UNKNOWN", "POLICY_STALE", "OBLIGATIONS_HIGH", "FOIR_TYPICAL", "LTV_TYPICAL"].includes(x.code)) && !r.policyNeedsReview) return "NOT_MATCHED";
  return r.status === "STRONG" && r.checks.length === 0 ? "ELIGIBLE" : "CONDITIONAL";
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
const inr = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);
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
    rentalIncome: "",
    otherIncome: "",
    abb: "",
    agreementValue: "",
    stampDuty: "",
    industry: "",
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
  { key: "rentalIncome", label: "Rent received (₹/month)" },
  { key: "otherIncome", label: "Other income (₹/month)" },
  { key: "abb", label: "Average bank balance (₹/month)" },
  { key: "agreementValue", label: "Agreement value, if buying (₹)" },
  { key: "stampDuty", label: "Stamp duty, if buying (₹)" },
  { key: "industry", label: "Business: service, manufacturing or trading" },
];

/**
 * Smart match for one lead: the website advisor's answers are already filled in; staff fix or add
 * anything, run it, and see which lenders' recorded rules the profile appears to fit and why.
 * It is a shortlist for a person to check, never an approval.
 */
export function SmartMatchPanel({ lead, applicationId }: { lead: Lead; applicationId?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canReview = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [form, setForm] = useState(() => prefill(lead));
  const [run, setRun] = useState<Run | null>(null);
  const [open, setOpen] = useState(false);
  const [flyer, setFlyer] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const autoRun = useRef(false);

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
        rentalIncome: num(form.rentalIncome),
        otherIncome: num(form.otherIncome),
        abb: num(form.abb),
        agreementValue: num(form.agreementValue),
        stampDuty: num(form.stampDuty),
        industry: form.industry.trim() || undefined,
        fields: Object.fromEntries(Object.entries(extra).filter(([, v]) => v.trim() !== "")),
      };
      return api<Run>("/lender-policies/match", { method: "POST", body: JSON.stringify({ loanProductId: productId, leadId: lead.id, applicationId, profile }) });
    },
    onSuccess: (r) => {
      setRun(r);
      void queryClient.invalidateQueries({ queryKey: ["match-runs", lead.id] });
    },
  });

  // What is already known about the lead (its own details, and what the customer said in the chat or the form) fills the blanks,
  // and the first time the panel opens the match runs by itself so the lenders show straight away.
  const known = useQuery({
    queryKey: ["match-profile", lead.id, applicationId],
    queryFn: () => api<Record<string, unknown>>(`/lender-policies/match/profile?leadId=${lead.id}${applicationId ? `&applicationId=${applicationId}` : ""}`),
    enabled: open && Boolean(productId),
  });
  useEffect(() => {
    if (!known.data || autoRun.current) return;
    autoRun.current = true;
    const answered = (known.data as { fields?: Record<string, unknown> }).fields;
    if (answered) setExtra(Object.fromEntries(Object.entries(answered).map(([k, v]) => [k, v === true ? "Yes" : v === false ? "No" : String(v)])));
    setForm((f) => {
      const next = { ...f } as Record<string, string>;
      for (const [k, v] of Object.entries(known.data)) if (k in next && (applicationId || (next[k] ?? "") === "") && v !== undefined && v !== null) next[k] = String(v);
      return next as typeof f;
    });
  }, [known.data]);
  useEffect(() => {
    // runs once, after the filled-in form has been applied
    if (autoRun.current && known.data && !run && !go.isPending && !go.isError) go.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, known.data]);

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) => api(`/lender-policies/match/runs/${id}/review`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (_d, v) => {
      setRun((r) => (r ? { ...r, reviewStatus: v.status } : r));
      void queryClient.invalidateQueries({ queryKey: ["match-runs", lead.id] });
    },
  });

  const [showNot, setShowNot] = useState(false);
  const counts = useMemo(() => {
    const c = { ELIGIBLE: 0, CONDITIONAL: 0, NOT_MATCHED: 0 };
    for (const r of run?.results ?? []) c[categoryOf(r)]++;
    return c;
  }, [run]);
  const shown = useMemo(() => (run?.results ?? []).filter((r) => showNot || categoryOf(r) !== "NOT_MATCHED"), [run, showNot]);
  const hidden = (run?.results.length ?? 0) - (run?.results ?? []).filter((r) => categoryOf(r) !== "NOT_MATCHED").length;

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
                <FieldInputs values={extra} onChange={setExtra} product={lead.loanProduct?.slug} employmentType={form.employmentType || undefined} />
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
              {!!run.missingFields?.length && <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Still needed before a lender can be called Eligible: {run.missingFields.map((f) => f.label).join(", ")}. Fill it in above and run the match again.</p>}
              {run.noPolicies && <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">No lender has rules recorded for this loan product yet. Add them under Lender policies.</p>}
              {run.results.length > 0 && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).map((k) => (
                    <div key={k} title={CATEGORY[k].help} className={clsx("rounded-lg px-2 py-2", CATEGORY[k].cls)}>
                      <p className="text-lg font-extrabold">{counts[k]}</p>
                      <p className="text-[11px] font-bold">{CATEGORY[k].label}</p>
                    </div>
                  ))}
                </div>
              )}
              {shown.map((r) => (
                <article key={r.policyId} className="rounded-lg border border-line p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[14px] font-bold text-navy">{r.lenderName}</h3>
                    <span className="flex items-center gap-2">
                      {r.score !== null && <span className="text-[13px] font-bold text-navy">{r.score}/100</span>}
                      <span title={CATEGORY[categoryOf(r)].help} className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", CATEGORY[categoryOf(r)].cls)}>{CATEGORY[categoryOf(r)].label}</span>
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
                  {r.programFit && r.programFit.length > 0 && (
                    <div className="mt-2 space-y-1.5 rounded-md border border-line px-3 py-2 text-[12px]">
                      <p className="font-semibold text-navy">Which of this lender's programs fits</p>
                      {r.programFit.map((f) => (
                        <details key={f.name} className="rounded bg-bg-light/60 px-2 py-1.5" open={f.verdict === "FITS"}>
                          <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                            <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-bold", f.verdict === "FITS" ? "bg-emerald-50 text-emerald-700" : f.verdict === "MAYBE" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700")}>
                              {f.verdict === "FITS" ? "Fits" : f.verdict === "MAYBE" ? "Possible, needs checking" : "Misses a rule"}
                            </span>
                            <span className="font-semibold text-navy">{f.name}</span>
                            {f.unconfirmed.length > 0 && <span className="text-[11px] text-amber-700">not confirmed with the lender: {f.unconfirmed.join(", ")}</span>}
                          </summary>
                          {f.indicative && (
                            <div className="mt-1.5 rounded bg-white px-2 py-1.5">
                              {f.indicative.amount !== null ? (
                                <p className="font-semibold text-navy">Indicative amount: about {inr(f.indicative.amount)}, the lowest of: {f.indicative.parts.map((x) => `${x.label} ${inr(x.amount)}`).join("; ")}</p>
                              ) : null}
                              <p className="text-muted">{f.indicative.note} Indicative only, to check with the lender.</p>
                            </div>
                          )}
                          <ul className="mt-1.5 space-y-0.5">
                            {f.ok.map((x, i) => <li key={`o${i}`} className="flex items-start gap-1.5 text-emerald-800"><Check className="mt-0.5 h-3 w-3 shrink-0" />{x}</li>)}
                            {f.gaps.map((x, i) => <li key={`g${i}`} className="flex items-start gap-1.5 text-red-700"><X className="mt-0.5 h-3 w-3 shrink-0" />{x}</li>)}
                            {f.needs.map((x, i) => <li key={`n${i}`} className="flex items-start gap-1.5 text-amber-800"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />Find out: {x}</li>)}
                          </ul>
                        </details>
                      ))}
                    </div>
                  )}
                  {r.exceptions.length > 0 && (
                    <div className="mt-2 rounded-md bg-bg-light px-3 py-2 text-[12px] text-muted">
                      <p className="font-semibold text-navy">Known exceptions</p>
                      {r.exceptions.map((x, i) => (
                        <p key={i}>{x.scenario}{x.requiredApproval ? ` — approval: ${x.requiredApproval}` : ""}{x.expertNote ? ` (${x.expertNote})` : ""}</p>
                      ))}
                    </div>
                  )}
                  {r.details && (r.details.notes || r.details.specialScheme || r.details.sheet.length > 0 || r.details.flyer) && (
                    <details className="mt-2 rounded-md border border-line text-[12px]">
                      <summary className="cursor-pointer px-3 py-2 font-semibold text-navy">
                        Notes and policy details{r.details.sheet.length > 0 ? ` (${r.details.sheet.length} on the one-pager)` : ""}
                      </summary>
                      <div className="space-y-2.5 border-t border-line px-3 py-2.5 text-muted">
                        {r.details.specialScheme && <p><strong className="text-navy">Schemes: </strong>{r.details.specialScheme}</p>}
                        {r.details.notes && <p className="whitespace-pre-line"><strong className="text-navy">Notes from the flyer: </strong>{r.details.notes}</p>}
                        {r.details.sheet.length > 0 && (
                          <div className="overflow-x-auto rounded-md border border-line">
                            <table className="data-table">
                              <thead><tr><th>Detail</th><th>What the bank says</th></tr></thead>
                              <tbody>{r.details.sheet.map((d) => <tr key={d.label}><td className="font-semibold whitespace-nowrap text-navy">{d.label}</td><td className="text-ink">{d.value}</td></tr>)}</tbody>
                            </table>
                          </div>
                        )}
                        {r.details.flyer && (
                          <p>
                            Taken from <strong className="text-navy">{r.details.flyer.name}</strong>.{" "}
                            {canReview && <button type="button" className="font-semibold text-navy underline" onClick={() => setFlyer(r.details!.flyer!.id)}>See the flyer</button>}
                          </p>
                        )}
                        <p className="text-[11px]">The match above weighs the numbers only. These notes are shown for a person to read; they are not scored.</p>
                      </div>
                    </details>
                  )}
                  <p className="mt-2 text-[11px] text-muted">Based on policy version {r.policyVersion ?? "—"}.</p>
                </article>
              ))}
              {hidden > 0 && (
                <button type="button" onClick={() => setShowNot(!showNot)} className="text-[12px] font-semibold text-gold-dark">
                  {showNot ? "Hide" : "Show"} the {hidden} {hidden === 1 ? "lender" : "lenders"} not matched, with the reason
                </button>
              )}
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
      {flyer && <ReviewModal id={flyer} onClose={() => setFlyer(null)} />}
    </section>
  );
}
