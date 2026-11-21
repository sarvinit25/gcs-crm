import { Plus, Trash2 } from "lucide-react";

// Programs and conditions on a lender policy. The condition list mirrors backend/src/lender-policies/policy-extras.ts.

export type Program = {
  name: string;
  minAmount: number | null;
  maxAmount: number | null;
  minRate: number | null;
  maxRate: number | null;
  minTenureMonths: number | null;
  maxTenureMonths: number | null;
  ltv: string | null;
  minAge: number | null;
  maxAge: number | null;
  who: string | null;
  documents: string[];
  conditions: string | null;
  fee: string | null;
  maxFoirPct: number | null;
  maxLtvPct: number | null;
  abbMultiple: number | null;
  minBusinessVintageMonths: number | null;
  minCreditScore: number | null;
  employmentTypes: string[];
  propertyTypes: string[];
  occupancy: string | null;
  rules: ProgramRule[];
  status: Partial<Record<CoreRule, RuleStatus>>;
};
export type RuleStatus = "CONFIRMED" | "PENDING" | "NOT_APPLICABLE";
export type ProgramRule = { label: string; value: string; status: RuleStatus };
export type CoreRule = "maxFoirPct" | "maxLtvPct" | "abbMultiple" | "minBusinessVintageMonths" | "minCreditScore";
const STATUS_LABEL: Record<RuleStatus, string> = { CONFIRMED: "Confirmed", PENDING: "Pending confirmation", NOT_APPLICABLE: "Not applicable" };
export type Conditions = Record<string, string | number>;

export const CONDITION_FIELDS: { key: string; label: string; type: "text" | "longtext" | "number" | "percent"; hint?: string }[] = [
  { key: "rating", label: "Minimum credit rating of the borrower", type: "text", hint: "For example BBB- and above" },
  { key: "dscr", label: "Minimum DSCR (times)", type: "number", hint: "For example 1.2" },
  { key: "guarantee", label: "Guarantee", type: "text", hint: "For example personal and corporate guarantee required" },
  { key: "security", label: "Security / collateral", type: "text" },
  { key: "collateralMarginPct", label: "Cash or FD margin (%)", type: "percent" },
  { key: "chargeOnAssets", label: "Charge on current assets", type: "text" },
  { key: "drawingPower", label: "Drawing power", type: "text" },
  { key: "payableDays", label: "Maximum days payable", type: "number" },
  { key: "moratoriumMonths", label: "Moratorium (months)", type: "number" },
  { key: "fundingPct", label: "Maximum funding of the cost (%)", type: "percent" },
  { key: "endUse", label: "Allowed end use", type: "text" },
  { key: "sectors", label: "Sector or customer restriction", type: "text", hint: "For example manufacturing only" },
  { key: "profiles", label: "Customer profiles accepted", type: "longtext" },
  { key: "cibilPolicy", label: "If the credit score is low", type: "longtext" },
  { key: "specialFeatures", label: "Special features", type: "longtext" },
  { key: "payoutNote", label: "Payout note", type: "text" },
];

export const BLANK_PROGRAM: Program = { name: "", minAmount: null, maxAmount: null, minRate: null, maxRate: null, minTenureMonths: null, maxTenureMonths: null, ltv: null, minAge: null, maxAge: null, who: null, documents: [], conditions: null, fee: null, maxFoirPct: null, maxLtvPct: null, abbMultiple: null, minBusinessVintageMonths: null, minCreditScore: null, employmentTypes: [], propertyTypes: [], occupancy: null, rules: [], status: {} };

const num = (s: string): number | null => {
  const t = s.replace(/[^0-9.]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const L = "block text-[11px] font-bold tracking-wide text-muted uppercase";

/** One line per program, for lists: "ITR Program: up to ₹1 Cr · 20 yrs". */
export function programLine(p: Program): string {
  const rupee = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString("en-IN")}`);
  const bits = [
    p.minAmount !== null && p.maxAmount !== null ? `${rupee(p.minAmount)} to ${rupee(p.maxAmount)}` : p.maxAmount !== null ? `up to ${rupee(p.maxAmount)}` : p.minAmount !== null ? `from ${rupee(p.minAmount)}` : null,
    p.maxTenureMonths !== null ? `${+(p.maxTenureMonths / 12).toFixed(1)} yrs` : null,
    p.ltv ? `LTV ${p.ltv}` : null,
  ].filter(Boolean);
  return `${p.name}${bits.length ? `: ${bits.join(" · ")}` : ""}`;
}

/** A small "Confirmed / Pending / Not applicable" picker, so an unconfirmed rule is never taken for approved policy. */
function StatusPick({ value, onChange }: { value: RuleStatus | undefined; onChange: (v: RuleStatus | undefined) => void }) {
  return (
    <select className="field mt-1 text-[12px]" aria-label="Status of this rule" value={value ?? ""} onChange={(e) => onChange((e.target.value || undefined) as RuleStatus | undefined)}>
      <option value="">Status: not stated</option>
      {(Object.keys(STATUS_LABEL) as RuleStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
    </select>
  );
}

/** The lender's named programs under one loan type, each with its own limits. */
export function ProgramsEditor({ value, onChange }: { value: Program[]; onChange: (v: Program[]) => void }) {
  const set = (i: number, next: Partial<Program>) => onChange(value.map((p, j) => (j === i ? { ...p, ...next } : p)));
  return (
    <div className="space-y-3 sm:col-span-2">
      {value.length === 0 && <p className="text-[12px] text-muted">None yet. Add one for each named program the lender runs under this loan type, for example "Salaried", "Banking" or "ITR".</p>}
      {value.map((p, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-line bg-bg-light/40 p-3">
          <div className="flex items-center gap-2">
            <input className="field flex-1 font-semibold" placeholder="Program name" maxLength={80} value={p.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Program name" />
            <button type="button" className="rounded p-1.5 text-muted hover:bg-white hover:text-red-600" aria-label={`Remove ${p.name || "program"}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <label><span className={L}>Loan from (₹)</span><input className="field mt-1" inputMode="numeric" value={p.minAmount ?? ""} onChange={(e) => set(i, { minAmount: num(e.target.value) })} /></label>
            <label><span className={L}>Loan up to (₹)</span><input className="field mt-1" inputMode="numeric" value={p.maxAmount ?? ""} onChange={(e) => set(i, { maxAmount: num(e.target.value) })} /></label>
            <label><span className={L}>Rate from (%)</span><input className="field mt-1" inputMode="decimal" value={p.minRate ?? ""} onChange={(e) => set(i, { minRate: num(e.target.value) })} /></label>
            <label><span className={L}>Rate up to (%)</span><input className="field mt-1" inputMode="decimal" value={p.maxRate ?? ""} onChange={(e) => set(i, { maxRate: num(e.target.value) })} /></label>
            <label><span className={L}>Longest tenure (months)</span><input className="field mt-1" inputMode="numeric" value={p.maxTenureMonths ?? ""} onChange={(e) => set(i, { maxTenureMonths: num(e.target.value) })} /></label>
            <label><span className={L}>LTV</span><input className="field mt-1" placeholder="80% (85% with insurance)" value={p.ltv ?? ""} onChange={(e) => set(i, { ltv: e.target.value || null })} /></label>
            <label><span className={L}>Minimum age</span><input className="field mt-1" inputMode="numeric" value={p.minAge ?? ""} onChange={(e) => set(i, { minAge: num(e.target.value) })} /></label>
            <label><span className={L}>Maximum age</span><input className="field mt-1" inputMode="numeric" value={p.maxAge ?? ""} onChange={(e) => set(i, { maxAge: num(e.target.value) })} /></label>
          </div>
          <div className="rounded-md border border-line bg-white p-2.5">
            <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">This program's rules the CRM can test</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {([["maxFoirPct", "Highest FOIR (%)"], ["maxLtvPct", "Highest LTV (%)"], ["abbMultiple", "ABB, times the EMI"], ["minBusinessVintageMonths", "Business vintage (months)"], ["minCreditScore", "Lowest credit score"]] as [CoreRule, string][]).map(([k, label]) => (
                <label key={k}><span className={L}>{label}</span>
                  <input className="field mt-1" inputMode="decimal" value={p[k] ?? ""} onChange={(e) => set(i, { [k]: num(e.target.value) } as Partial<Program>)} />
                  <StatusPick value={p.status[k]} onChange={(v) => { const st = { ...p.status }; if (v) st[k] = v; else delete st[k]; set(i, { status: st }); }} />
                </label>
              ))}
              <label><span className={L}>Applicant type</span>
                <select className="field mt-1" value={p.employmentTypes.join(",")} onChange={(e) => set(i, { employmentTypes: e.target.value ? e.target.value.split(",") : [] })}>
                  <option value="">Not stated</option><option value="SALARIED">Salaried only</option><option value="SELF_EMPLOYED">Self-employed only</option><option value="SALARIED,SELF_EMPLOYED">Both</option>
                </select>
              </label>
              <label><span className={L}>Property types (commas)</span><input className="field mt-1" placeholder="Residential, Commercial" value={p.propertyTypes.join(", ")} onChange={(e) => set(i, { propertyTypes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
              <label><span className={L}>Occupancy</span><input className="field mt-1" placeholder="Self-occupied" maxLength={80} value={p.occupancy ?? ""} onChange={(e) => set(i, { occupancy: e.target.value || null })} /></label>
            </div>
            <p className="mt-3 mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Other rules of this lender (anything the fields above do not cover)</p>
            {p.rules.map((r, ri) => (
              <div key={ri} className="mb-1.5 grid gap-1.5 sm:grid-cols-[1fr_2fr_11rem_auto]">
                <input className="field" placeholder="Rule, e.g. Service margin" maxLength={80} value={r.label} onChange={(e) => set(i, { rules: p.rules.map((x, j) => (j === ri ? { ...x, label: e.target.value } : x)) })} />
                <input className="field" placeholder="Value, e.g. 15% of turnover" maxLength={200} value={r.value} onChange={(e) => set(i, { rules: p.rules.map((x, j) => (j === ri ? { ...x, value: e.target.value } : x)) })} />
                <select className="field text-[12px]" aria-label="Status" value={r.status} onChange={(e) => set(i, { rules: p.rules.map((x, j) => (j === ri ? { ...x, status: e.target.value as RuleStatus } : x)) })}>
                  {(Object.keys(STATUS_LABEL) as RuleStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
                </select>
                <button type="button" className="rounded p-1.5 text-muted hover:text-red-600" aria-label="Remove rule" onClick={() => set(i, { rules: p.rules.filter((_, j) => j !== ri) })}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {p.rules.length < 20 && <button type="button" className="btn-ghost text-[12px]" onClick={() => set(i, { rules: [...p.rules, { label: "", value: "", status: "PENDING" }] })}><Plus className="h-3.5 w-3.5" /> Add a rule</button>}
          </div>
          <label className="block"><span className={L}>Who it is for and how income is judged</span><input className="field mt-1" maxLength={300} value={p.who ?? ""} onChange={(e) => set(i, { who: e.target.value || null })} /></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block"><span className={L}>Documents (separate with commas)</span><input className="field mt-1" value={p.documents.join(", ")} onChange={(e) => set(i, { documents: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
            <label className="block"><span className={L}>Processing fee</span><input className="field mt-1" maxLength={120} value={p.fee ?? ""} onChange={(e) => set(i, { fee: e.target.value || null })} /></label>
          </div>
          <label className="block"><span className={L}>Anything else about this program</span><input className="field mt-1" maxLength={500} value={p.conditions ?? ""} onChange={(e) => set(i, { conditions: e.target.value || null })} /></label>
        </div>
      ))}
      {value.length < 12 && <button type="button" className="btn-ghost" onClick={() => onChange([...value, { ...BLANK_PROGRAM }])}><Plus className="h-4 w-4" /> Add a program</button>}
    </div>
  );
}

/** Rules that are not amounts or rates: rating, DSCR, guarantee, security, moratorium, end use and so on. */
export function ConditionsEditor({ value, onChange }: { value: Conditions; onChange: (v: Conditions) => void }) {
  const set = (key: string, v: string | number | null) => {
    const next = { ...value };
    if (v === null || v === "") delete next[key];
    else next[key] = v;
    onChange(next);
  };
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      {CONDITION_FIELDS.map((f) => {
        const v = value[f.key];
        const wide = f.type === "longtext";
        return (
          <label key={f.key} className={wide ? "block sm:col-span-2" : "block"}>
            <span className="text-[13px] font-semibold text-navy">{f.label}</span>
            {wide ? (
              <textarea className="field mt-1.5 font-normal" rows={2} maxLength={600} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input className="field mt-1.5 font-normal" maxLength={200} inputMode={f.type === "text" ? undefined : "decimal"} value={String(v ?? "")}
                onChange={(e) => (f.type === "text" ? set(f.key, e.target.value) : set(f.key, num(e.target.value)))} />
            )}
            {f.hint && <span className="mt-0.5 block text-[11px] font-normal text-muted">{f.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}
