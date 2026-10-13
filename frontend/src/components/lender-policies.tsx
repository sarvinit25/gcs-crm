import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, History, Loader2, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatAmount, formatDate, humanize } from "../lib/format";
import { Modal } from "./modal";
import { PageHeader } from "./app-shell";
import { TableSkeleton } from "./skeleton";

type Freshness = "OK" | "DUE" | "STALE" | "NEVER";
type Band = { upTo: number | null; value: number };

export type PolicyRow = {
  id: string;
  lenderId: string;
  loanProductId: string;
  lender: { id: string; name: string };
  loanProduct: { id: string; name: string; slug: string };
  active: boolean;
  version: number;
  source: string | null;
  lastVerifiedAt: string | null;
  verifiedByName: string | null;
  reviewEveryDays: number;
  minAmount: string | null;
  maxAmount: string | null;
  minRate: string | null;
  maxRate: string | null;
  processingFee: string | null;
  maxTenureMonths: number | null;
  specialScheme: string | null;
  employmentTypes: string[];
  minAge: number | null;
  maxAgeAtApplication: number | null;
  maxAgeAtMaturity: number | null;
  minMonthlyIncome: string | null;
  minBusinessVintageMonths: number | null;
  minAnnualTurnover: string | null;
  minAnnualProfit: string | null;
  minCreditScore: number | null;
  acceptedConstitutions: string[];
  gstRequired: boolean;
  foirBands: Band[] | null;
  ltvBands: Band[] | null;
  acceptedPropertyTypes: string[];
  allIndia: boolean;
  cities: string[];
  notes: string | null;
  freshness: Freshness;
  _count?: { exceptions: number };
};

type PolicyDetail = PolicyRow & {
  exceptions: {
    id: string;
    scenario: string;
    normalRule: string | null;
    possibleException: string | null;
    requiredApproval: string | null;
    source: string | null;
    expertNote: string | null;
    lastVerifiedAt: string | null;
    active: boolean;
  }[];
  changes: { id: string; version: number; reason: string | null; changedByName: string | null; createdAt: string }[];
};

type Outcome = {
  id: string;
  leadId: string | null;
  lenderId: string | null;
  loanProductId: string | null;
  outcome: string;
  sanctionAmount: string | null;
  rate: string | null;
  turnaroundDays: number | null;
  rejectionReason: string | null;
  disbursed: boolean;
  notes: string | null;
  createdAt: string;
};

type Named = { id: string; name: string };
const useLenders = () => useQuery({ queryKey: ["lenders"], queryFn: () => api<Named[]>("/lenders/assignable") });
const useProducts = () => useQuery({ queryKey: ["loan-products"], queryFn: () => api<(Named & { slug: string })[]>("/loan-products") });

const FRESH: Record<Freshness, { label: string; cls: string }> = {
  OK: { label: "Verified", cls: "bg-emerald-50 text-emerald-700" },
  DUE: { label: "Review soon", cls: "bg-amber-50 text-amber-700" },
  STALE: { label: "Out of date", cls: "bg-red-50 text-red-700" },
  NEVER: { label: "Not verified", cls: "bg-red-50 text-red-700" },
};

export function FreshnessBadge({ value }: { value: Freshness }) {
  return <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", FRESH[value].cls)}>{FRESH[value].label}</span>;
}

const asNum = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(/,/g, "");
  return s === "" ? null : Number(s);
};
const asList = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** A few rows of "for ... up to ₹X, the limit is Y%". A blank ceiling means "any amount". */
function BandsField({ name, label, unit, hint, initial }: { name: string; label: string; unit: string; hint: string; initial: Band[] | null }) {
  const [rows, setRows] = useState<{ upTo: string; value: string }[]>(
    initial?.length ? initial.map((b) => ({ upTo: b.upTo === null ? "" : String(b.upTo), value: String(b.value) })) : [],
  );
  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-[13px] font-semibold text-navy">{label}</legend>
      <p className="text-[12px] text-muted">{hint}</p>
      <input type="hidden" name={name} value={JSON.stringify(rows.filter((r) => r.value).map((r) => ({ upTo: r.upTo === "" ? null : Number(r.upTo.replace(/,/g, "")), value: Number(r.value) })))} />
      <div className="mt-1.5 space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[12px] text-muted">up to ₹</span>
            <input value={r.upTo} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, upTo: e.target.value } : x)))} placeholder="any" inputMode="numeric" className="field w-32 font-normal" />
            <span className="text-[12px] text-muted">limit</span>
            <input value={r.value} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} inputMode="decimal" className="field w-20 font-normal" />
            <span className="text-[12px] text-muted">{unit}</span>
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-navy" aria-label="Remove row">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setRows([...rows, { upTo: "", value: "" }])} className="text-[12px] font-semibold text-navy hover:underline">
          + Add a row
        </button>
      </div>
    </fieldset>
  );
}

function NumField({ name, label, value, hint }: { name: string; label: string; value: string | number | null | undefined; hint?: string }) {
  return (
    <label className="text-[13px] font-semibold text-navy">
      {label}
      <input name={name} inputMode="decimal" defaultValue={value ?? ""} className="field mt-1.5 font-normal" />
      {hint && <span className="mt-0.5 block text-[11px] font-normal text-muted">{hint}</span>}
    </label>
  );
}

/** Add or change one lender's rules for one loan product. Blank means "not recorded", never "no limit". */
function PolicyEditor({ policy, onClose }: { policy?: PolicyRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const lenders = useLenders();
  const products = useProducts();
  const [employment, setEmployment] = useState<string[]>(policy?.employmentTypes ?? []);
  const [allIndia, setAllIndia] = useState(policy?.allIndia ?? false);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      policy
        ? api(`/lender-policies/${policy.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/lender-policies", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lender-policies"] });
      onClose();
    },
  });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const bands = (k: string) => {
      const parsed = JSON.parse(text(k) || "[]") as Band[];
      return parsed.length ? parsed : null;
    };
    const body: Record<string, unknown> = {
      ...(policy ? {} : { lenderId: text("lenderId"), loanProductId: text("loanProductId") }),
      source: text("source") || null,
      reviewEveryDays: asNum(f.get("reviewEveryDays")) ?? 90,
      minAmount: asNum(f.get("minAmount")),
      maxAmount: asNum(f.get("maxAmount")),
      minRate: asNum(f.get("minRate")),
      maxRate: asNum(f.get("maxRate")),
      processingFee: text("processingFee") || null,
      maxTenureMonths: asNum(f.get("maxTenureMonths")),
      specialScheme: text("specialScheme") || null,
      employmentTypes: employment,
      minAge: asNum(f.get("minAge")),
      maxAgeAtApplication: asNum(f.get("maxAgeAtApplication")),
      maxAgeAtMaturity: asNum(f.get("maxAgeAtMaturity")),
      minMonthlyIncome: asNum(f.get("minMonthlyIncome")),
      minBusinessVintageMonths: asNum(f.get("minBusinessVintageMonths")),
      minAnnualTurnover: asNum(f.get("minAnnualTurnover")),
      minAnnualProfit: asNum(f.get("minAnnualProfit")),
      minCreditScore: asNum(f.get("minCreditScore")),
      acceptedConstitutions: asList(f.get("acceptedConstitutions")),
      gstRequired: f.get("gstRequired") === "on",
      foirBands: bands("foirBands"),
      ltvBands: bands("ltvBands"),
      acceptedPropertyTypes: asList(f.get("acceptedPropertyTypes")),
      allIndia,
      cities: allIndia ? [] : asList(f.get("cities")),
      notes: text("notes") || null,
      ...(policy ? { reason: text("reason") || undefined } : {}),
    };
    save.mutate(body);
  };

  const toggleEmp = (v: string) => setEmployment((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]));
  const section = "sm:col-span-2 mt-2 border-t border-line pt-3 text-[12px] font-bold tracking-wide text-muted uppercase";

  return (
    <Modal
      title={policy ? "Edit lender policy" : "Add a lender policy"}
      subtitle={policy ? `${policy.lender.name} · ${policy.loanProduct.name} · version ${policy.version}` : "One lender, one loan product"}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {!policy && (
          <>
            <label className="text-[13px] font-semibold text-navy">
              Bank / NBFC
              <select name="lenderId" required defaultValue="" className="field mt-1.5 font-normal">
                <option value="" disabled>Choose…</option>
                {(lenders.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="text-[13px] font-semibold text-navy">
              Loan product
              <select name="loanProductId" required defaultValue="" className="field mt-1.5 font-normal">
                <option value="" disabled>Choose…</option>
                {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="text-[13px] font-semibold text-navy">
          Where these rules came from
          <input name="source" defaultValue={policy?.source ?? ""} placeholder="e.g. RM email 12 Oct, policy circular" className="field mt-1.5 font-normal" />
        </label>
        <NumField name="reviewEveryDays" label="Re-check every (days)" value={policy?.reviewEveryDays ?? 90} hint="After this long without a check, the matcher stops trusting these rules." />

        <p className={section}>What the lender offers</p>
        <NumField name="minAmount" label="Minimum loan (₹)" value={policy?.minAmount?.replace(/\.00$/, "")} />
        <NumField name="maxAmount" label="Maximum loan (₹)" value={policy?.maxAmount?.replace(/\.00$/, "")} />
        <NumField name="minRate" label="Rate from (% p.a.)" value={policy?.minRate} />
        <NumField name="maxRate" label="Rate up to (% p.a.)" value={policy?.maxRate} />
        <label className="text-[13px] font-semibold text-navy">
          Processing fee
          <input name="processingFee" defaultValue={policy?.processingFee ?? ""} placeholder="e.g. up to 1% + GST" className="field mt-1.5 font-normal" />
        </label>
        <NumField name="maxTenureMonths" label="Longest tenure (months)" value={policy?.maxTenureMonths} />
        <label className="text-[13px] font-semibold text-navy sm:col-span-2">
          Special scheme
          <input name="specialScheme" defaultValue={policy?.specialScheme ?? ""} className="field mt-1.5 font-normal" />
        </label>

        <p className={section}>Who it is for</p>
        <fieldset className="sm:col-span-2">
          <legend className="text-[13px] font-semibold text-navy">Applicant types accepted (none ticked = not recorded)</legend>
          <div className="mt-1.5 flex gap-1.5">
            {[["SALARIED", "Salaried"], ["SELF_EMPLOYED", "Self-employed"]].map(([v, l]) => (
              <button type="button" key={v} aria-pressed={employment.includes(v!)} onClick={() => toggleEmp(v!)} className={clsx("rounded-full border px-2.5 py-1 text-[12px] font-semibold transition", employment.includes(v!) ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy/40")}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <NumField name="minAge" label="Minimum age" value={policy?.minAge} />
        <NumField name="maxAgeAtApplication" label="Maximum age at application" value={policy?.maxAgeAtApplication} />
        <NumField name="maxAgeAtMaturity" label="Maximum age when loan ends" value={policy?.maxAgeAtMaturity} />
        <NumField name="minMonthlyIncome" label="Minimum monthly income (₹)" value={policy?.minMonthlyIncome?.replace(/\.00$/, "")} />
        <NumField name="minCreditScore" label="Minimum credit score" value={policy?.minCreditScore} />
        <NumField name="minBusinessVintageMonths" label="Minimum years in business (in months)" value={policy?.minBusinessVintageMonths} />
        <NumField name="minAnnualTurnover" label="Minimum yearly turnover (₹)" value={policy?.minAnnualTurnover?.replace(/\.00$/, "")} />
        <NumField name="minAnnualProfit" label="Minimum yearly profit (₹)" value={policy?.minAnnualProfit?.replace(/\.00$/, "")} />
        <label className="text-[13px] font-semibold text-navy">
          Business types accepted
          <input name="acceptedConstitutions" defaultValue={policy?.acceptedConstitutions.join(", ")} placeholder="Proprietorship, LLP, Private Limited" className="field mt-1.5 font-normal" />
          <span className="mt-0.5 block text-[11px] font-normal text-muted">Separate with commas. Blank = not recorded.</span>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] font-semibold text-navy">
          <input type="checkbox" name="gstRequired" defaultChecked={policy?.gstRequired} className="h-4 w-4" />
          GST registration needed
        </label>

        <p className={section}>Money rules</p>
        <BandsField name="foirBands" label="Most of the income that may go to EMIs (FOIR)" unit="%" hint="Add a row per income level. Leave the amount blank for 'any income'." initial={policy?.foirBands ?? null} />
        <BandsField name="ltvBands" label="Most of the property value that can be lent (LTV)" unit="%" hint="Add a row per property-value level. Leave the amount blank for 'any value'." initial={policy?.ltvBands ?? null} />
        <label className="text-[13px] font-semibold text-navy sm:col-span-2">
          Property types accepted
          <input name="acceptedPropertyTypes" defaultValue={policy?.acceptedPropertyTypes.join(", ")} placeholder="Residential, Commercial" className="field mt-1.5 font-normal" />
        </label>

        <p className={section}>Where it is available</p>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-navy sm:col-span-2">
          <input type="checkbox" checked={allIndia} onChange={(e) => setAllIndia(e.target.checked)} className="h-4 w-4" />
          Serves all of India
        </label>
        {!allIndia && (
          <label className="text-[13px] font-semibold text-navy sm:col-span-2">
            Cities served
            <input name="cities" defaultValue={policy?.cities.join(", ")} placeholder="Mumbai, Thane, Navi Mumbai, Pune" className="field mt-1.5 font-normal" />
            <span className="mt-0.5 block text-[11px] font-normal text-muted">Blank = not confirmed, so the matcher will ask a person.</span>
          </label>
        )}

        <label className="text-[13px] font-semibold text-navy sm:col-span-2">
          Notes
          <textarea name="notes" rows={2} defaultValue={policy?.notes ?? ""} className="field mt-1.5 font-normal" />
        </label>
        {policy && (
          <label className="text-[13px] font-semibold text-navy sm:col-span-2">
            What changed (kept in the history)
            <input name="reason" placeholder="e.g. new rate card from the bank" className="field mt-1.5 font-normal" />
          </label>
        )}
        {save.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 sm:col-span-2">{(save.error as Error).message}</p>}
        <div className="flex items-center gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {policy ? "Save as a new version" : "Add policy"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

/** Exceptions (what experienced staff know) and the version history for one policy. */
function PolicyNotes({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["lender-policy", id], queryFn: () => api<PolicyDetail>(`/lender-policies/${id}`) });
  const [adding, setAdding] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["lender-policy", id] });
    void queryClient.invalidateQueries({ queryKey: ["lender-policies"] });
  };
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/lender-policies/${id}/exceptions`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setAdding(false);
      refresh();
    },
  });
  const patch = useMutation({
    mutationFn: ({ eid, body }: { eid: string; body: Record<string, unknown> }) => api(`/lender-policies/exceptions/${eid}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: refresh,
  });
  const d = detail.data;

  return (
    <Modal title="Exceptions and history" subtitle={d ? `${d.lender.name} · ${d.loanProduct.name}` : undefined} onClose={onClose} maxWidth="max-w-2xl">
      {!d ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      ) : (
        <div className="space-y-6">
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-navy">When this lender bends a rule</h3>
              {canEdit && !adding && (
                <button onClick={() => setAdding(true)} className="btn-ghost"><Plus className="h-4 w-4" /> Add</button>
              )}
            </div>
            <p className="text-[12px] text-muted">What the rule sheet does not say. The matcher shows these to staff next to the lender.</p>
            {adding && (
              <form
                className="mt-3 grid gap-2 rounded-lg border border-line p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const t = (k: string) => String(f.get(k) ?? "").trim() || null;
                  add.mutate({ scenario: t("scenario"), normalRule: t("normalRule"), possibleException: t("possibleException"), requiredApproval: t("requiredApproval"), source: t("source"), expertNote: t("expertNote"), verifiedNow: true });
                }}
              >
                <input name="scenario" required minLength={2} placeholder="Situation, e.g. Salary paid in cash" className="field" />
                <input name="normalRule" placeholder="The normal rule" className="field" />
                <input name="possibleException" placeholder="What may still be possible" className="field" />
                <input name="requiredApproval" placeholder="Who has to approve it" className="field" />
                <input name="source" placeholder="Where you learned this" className="field" />
                <input name="expertNote" placeholder="Your note for the team" className="field" />
                {add.isError && <p className="text-[13px] font-medium text-red-700">{(add.error as Error).message}</p>}
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={add.isPending}>Save</button>
                  <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
                </div>
              </form>
            )}
            <ul className="mt-3 space-y-2">
              {d.exceptions.length === 0 && !adding && <li className="text-[13px] text-muted">None recorded yet.</li>}
              {d.exceptions.map((x) => (
                <li key={x.id} className={clsx("rounded-lg border border-line p-3 text-[13px]", !x.active && "opacity-50")}>
                  <p className="font-semibold text-navy">{x.scenario}</p>
                  {x.normalRule && <p className="text-muted">Normally: {x.normalRule}</p>}
                  {x.possibleException && <p>May be possible: {x.possibleException}</p>}
                  {x.requiredApproval && <p className="text-muted">Approval: {x.requiredApproval}</p>}
                  {x.expertNote && <p className="mt-1 italic text-muted">{x.expertNote}</p>}
                  <p className="mt-1 text-[11px] text-muted">
                    {x.source ? `${x.source} · ` : ""}checked {formatDate(x.lastVerifiedAt)}
                  </p>
                  {canEdit && (
                    <div className="mt-1 flex gap-3 text-[12px] font-semibold text-navy">
                      <button onClick={() => patch.mutate({ eid: x.id, body: { verifiedNow: true } })} className="hover:underline">Still true today</button>
                      <button onClick={() => patch.mutate({ eid: x.id, body: { active: !x.active } })} className="hover:underline">{x.active ? "Switch off" : "Switch on"}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-navy"><History className="h-4 w-4" /> Version history</h3>
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-[13px]">
              {d.changes.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span><span className="font-semibold text-navy">v{c.version}</span> · {c.reason ?? "Changed"}</span>
                  <span className="text-[12px] text-muted">{c.changedByName ?? "—"} · {formatDate(c.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Modal>
  );
}

const OUTCOMES = ["SUBMITTED", "QUERY", "SANCTIONED", "REJECTED", "WITHDRAWN", "DISBURSED"];

function OutcomeEditor({ outcome, onClose }: { outcome?: Outcome; onClose: () => void }) {
  const queryClient = useQueryClient();
  const lenders = useLenders();
  const products = useProducts();
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      outcome
        ? api(`/lender-policies/outcomes/${outcome.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/lender-policies/outcomes", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["case-outcomes"] });
      void queryClient.invalidateQueries({ queryKey: ["case-outcome-summary"] });
      onClose();
    },
  });
  return (
    <Modal title={outcome ? "Edit case outcome" : "Record a case outcome"} onClose={onClose} maxWidth="max-w-lg">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const t = (k: string) => String(f.get(k) ?? "").trim();
          save.mutate({
            lenderId: t("lenderId") || undefined,
            loanProductId: t("loanProductId") || undefined,
            outcome: t("outcome"),
            sanctionAmount: asNum(f.get("sanctionAmount")),
            rate: asNum(f.get("rate")),
            turnaroundDays: asNum(f.get("turnaroundDays")),
            rejectionReason: t("rejectionReason") || null,
            disbursed: f.get("disbursed") === "on",
            notes: t("notes") || null,
          });
        }}
      >
        <label className="text-[13px] font-semibold text-navy">
          Bank / NBFC
          <select name="lenderId" defaultValue={outcome?.lenderId ?? ""} className="field mt-1.5 font-normal">
            <option value="">—</option>
            {(lenders.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="text-[13px] font-semibold text-navy">
          Loan product
          <select name="loanProductId" defaultValue={outcome?.loanProductId ?? ""} className="field mt-1.5 font-normal">
            <option value="">—</option>
            {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-[13px] font-semibold text-navy">
          What happened
          <select name="outcome" defaultValue={outcome?.outcome ?? "SUBMITTED"} className="field mt-1.5 font-normal">
            {OUTCOMES.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
          </select>
        </label>
        <NumField name="sanctionAmount" label="Sanctioned amount (₹)" value={outcome?.sanctionAmount?.replace(/\.00$/, "")} />
        <NumField name="rate" label="Rate (% p.a.)" value={outcome?.rate} />
        <NumField name="turnaroundDays" label="Days from submission to decision" value={outcome?.turnaroundDays} />
        <label className="text-[13px] font-semibold text-navy sm:col-span-2">
          Reason, if rejected
          <input name="rejectionReason" defaultValue={outcome?.rejectionReason ?? ""} className="field mt-1.5 font-normal" />
        </label>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-navy">
          <input type="checkbox" name="disbursed" defaultChecked={outcome?.disbursed} className="h-4 w-4" /> Money disbursed
        </label>
        <label className="text-[13px] font-semibold text-navy sm:col-span-2">
          Notes
          <input name="notes" defaultValue={outcome?.notes ?? ""} className="field mt-1.5 font-normal" />
        </label>
        {save.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 sm:col-span-2">{(save.error as Error).message}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary" disabled={save.isPending}>Save</button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function OutcomesTab({ canEdit }: { canEdit: boolean }) {
  const lenders = useLenders();
  const products = useProducts();
  const summary = useQuery({ queryKey: ["case-outcome-summary"], queryFn: () => api<{ lender: string; product: string; cases: number; decided: number; sanctionedShare: number | null; avgTurnaroundDays: number | null }[]>("/lender-policies/outcomes/summary") });
  const list = useQuery({ queryKey: ["case-outcomes"], queryFn: () => api<Outcome[]>("/lender-policies/outcomes") });
  const [editing, setEditing] = useState<Outcome | "new" | null>(null);
  const lname = new Map((lenders.data ?? []).map((l) => [l.id, l.name]));
  const pname = new Map((products.data ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-[13px] text-muted">How cases really end, by bank and product. Record each file's result here so GCS learns what gets sanctioned, how fast, and why files are turned down.</p>
        {canEdit && <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Record outcome</button>}
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
              <th className="px-4 py-3">Bank / NBFC</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Cases</th><th className="px-4 py-3">Decided</th><th className="px-4 py-3">Sanctioned</th><th className="px-4 py-3">Avg days to decide</th>
            </tr>
          </thead>
          <tbody>
            {(summary.data ?? []).map((s, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-4 py-2.5 font-semibold text-navy">{s.lender}</td><td className="px-4 py-2.5">{s.product}</td><td className="px-4 py-2.5">{s.cases}</td><td className="px-4 py-2.5">{s.decided}</td>
                <td className="px-4 py-2.5">{s.sanctionedShare === null ? "—" : `${s.sanctionedShare}%`}</td><td className="px-4 py-2.5">{s.avgTurnaroundDays ?? "—"}</td>
              </tr>
            ))}
            {summary.data?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No outcomes recorded yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <section className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
              <th className="px-4 py-3">Recorded</th><th className="px-4 py-3">Bank / NBFC</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Days</th><th className="px-4 py-3">Reason</th><th />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="px-4 py-2.5">{formatDate(o.createdAt)}</td>
                <td className="px-4 py-2.5">{(o.lenderId && lname.get(o.lenderId)) || "—"}</td>
                <td className="px-4 py-2.5">{(o.loanProductId && pname.get(o.loanProductId)) || "—"}</td>
                <td className="px-4 py-2.5 font-semibold text-navy">{humanize(o.outcome)}</td>
                <td className="px-4 py-2.5">{formatAmount(o.sanctionAmount)}</td>
                <td className="px-4 py-2.5">{o.rate ? `${o.rate}%` : "—"}</td>
                <td className="px-4 py-2.5">{o.turnaroundDays ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">{o.rejectionReason ?? ""}</td>
                <td className="px-2">{canEdit && <button onClick={() => setEditing(o)} className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-navy" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {editing && <OutcomeEditor outcome={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** The lender-policy database: every bank's rules for every product, how fresh they are, and what happens to files. */
export function LenderPoliciesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [tab, setTab] = useState<"policies" | "outcomes">("policies");
  const [lenderId, setLenderId] = useState("");
  const [editing, setEditing] = useState<PolicyRow | "new" | null>(null);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const lenders = useLenders();

  const list = useQuery({
    queryKey: ["lender-policies", { lenderId }],
    queryFn: () => api<PolicyRow[]>(`/lender-policies${lenderId ? `?lenderId=${lenderId}` : ""}`),
  });
  const verify = useMutation({
    mutationFn: (id: string) => api(`/lender-policies/${id}/verify`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["lender-policies"] }),
  });

  const rows = list.data ?? [];
  const needAttention = rows.filter((r) => r.freshness === "STALE" || r.freshness === "NEVER").length;

  return (
    <>
      <PageHeader
        title="Lender policies"
        subtitle="What each bank and NBFC will do, per loan product. The matcher only trusts rules that were checked recently."
        actions={canEdit && tab === "policies" ? <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add policy</button> : undefined}
      />
      <div className="space-y-5 px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          {(["policies", "outcomes"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition", tab === t ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy/40")}>
              {t === "policies" ? "Policies" : "Case outcomes"}
            </button>
          ))}
          {tab === "policies" && (
            <select value={lenderId} onChange={(e) => setLenderId(e.target.value)} className="field ml-auto w-56" aria-label="Filter by bank">
              <option value="">All banks &amp; NBFCs</option>
              {(lenders.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </div>

        {tab === "outcomes" ? (
          <OutcomesTab canEdit={canEdit} />
        ) : (
          <>
            {needAttention > 0 && (
              <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800">
                <ShieldAlert className="h-4 w-4" />
                {needAttention} {needAttention === 1 ? "policy is" : "policies are"} not verified or out of date. The matcher will send these lenders to a person instead of matching them.
              </p>
            )}
            <section className="card overflow-x-auto">
              {list.isLoading ? (
                <TableSkeleton rows={5} cols={6} />
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] tracking-wide text-muted uppercase">
                      <th className="px-4 py-3">Bank / NBFC</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Loan range</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last checked</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id} className={clsx("border-t border-line", !p.active && "opacity-50")}>
                        <td className="px-4 py-2.5 font-semibold text-navy">{p.lender.name}</td>
                        <td className="px-4 py-2.5">{p.loanProduct.name} <span className="text-[11px] text-muted">v{p.version}</span></td>
                        <td className="px-4 py-2.5">{p.minAmount || p.maxAmount ? `${formatAmount(p.minAmount)} – ${formatAmount(p.maxAmount)}` : "—"}</td>
                        <td className="px-4 py-2.5">{p.minRate || p.maxRate ? `${p.minRate ?? "?"}% – ${p.maxRate ?? "?"}%` : "—"}</td>
                        <td className="px-4 py-2.5"><FreshnessBadge value={p.freshness} /></td>
                        <td className="px-4 py-2.5 text-muted">{p.lastVerifiedAt ? `${formatDate(p.lastVerifiedAt)} · ${p.verifiedByName ?? ""}` : "never"}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <button onClick={() => setNotesFor(p.id)} className="rounded px-2 py-1.5 text-[12px] font-semibold text-navy hover:bg-bg-light">
                            Exceptions{p._count?.exceptions ? ` (${p._count.exceptions})` : ""} &amp; history
                          </button>
                          {canEdit && (
                            <>
                              <button onClick={() => verify.mutate(p.id)} disabled={verify.isPending} className="rounded px-2 py-1.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50" title="I have checked these rules against the lender's current policy today">
                                <BadgeCheck className="mr-1 inline h-3.5 w-3.5" />Mark checked
                              </button>
                              <button onClick={() => setEditing(p)} className="rounded p-1.5 text-muted hover:bg-bg-light hover:text-navy" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No policies yet. {canEdit ? "Add the first one with “Add policy”." : "An admin or manager can add them."}</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
      {editing && <PolicyEditor policy={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {notesFor && <PolicyNotes id={notesFor} canEdit={canEdit} onClose={() => setNotesFor(null)} />}
    </>
  );
}
