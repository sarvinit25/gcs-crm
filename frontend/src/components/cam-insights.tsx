import clsx from "clsx";

// What the CAM's numbers say, read from the last saved answers: the flags, the income programs side by side, the score
// and the ratios an analyst looks at. The same figures are in the Excel; this lets staff see them while filling in.

type Flag = { level: "risk" | "watch" | "good"; text: string };
type Program = { key: string; label: string; annual: number | null; note: string };
type ScoreItem = { name: string; value: string; points: number; min: number; max: number };

export type CamAnalysis = {
  monthlyIncome: number | null;
  incomeBasis: string;
  existingEmi: number;
  proposedEmi: number | null;
  foirAfter: number | null;
  foirCeiling: number;
  eligible: number | null;
  requested: number | null;
  flags: Flag[];
  programs: Program[];
  program: { chosen: string; highest: string | null };
  coApplicants: { count: number; income: number; lowestCibil: number | null; oldestAgeAtMaturity: number | null };
  bankingProgram: { abb: number; maxFoirPct: number; maxEmi: number; eligible: number | null } | null;
  doubleWhammy: { total: number; limit: number } | null;
  property: { ltvOnCost: number | null; ltvOnMarket: number | null };
  ratios: { currentRatio: number | null; debtEquityAfter: number | null; debtorDays: number | null; highCostDebtPct: number | null; projectedDscr: number | null };
  workingCapital: { bankFinance: number; existing: number; headroom: number } | null;
  dscr: number | null;
  scorecard: { items: ScoreItem[]; percent: number | null; grade: string | null; note: string };
};

const rupees = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const TONE = { risk: "bg-red-50 text-red-800", watch: "bg-amber-50 text-amber-800", good: "bg-emerald-50 text-emerald-800" } as const;
const LABEL = { risk: "Risk", watch: "Watch", good: "Good" } as const;
const GRADE_TONE: Record<string, string> = { A: "bg-emerald-600", B: "bg-emerald-500", C: "bg-amber-500", D: "bg-orange-500", E: "bg-red-500", F: "bg-red-700" };

export function CamInsights({ a }: { a: CamAnalysis }) {
  const nothing = a.flags.length === 0 && a.monthlyIncome === null && a.scorecard.items.length === 0;
  const facts: [string, string][] = [
    ["Income counted a month", rupees(a.monthlyIncome)],
    ["Running EMIs counted", rupees(a.existingEmi)],
    ["EMI on the loan asked for", rupees(a.proposedEmi)],
    ["Repayment after the loan", a.foirAfter === null ? "—" : `${a.foirAfter}% (ceiling ${a.foirCeiling}%)`],
    ["Loan the income supports", rupees(a.eligible)],
  ];
  if (a.coApplicants.count) facts.push(["Co-applicants add", `${rupees(a.coApplicants.income)} a month`]);
  if (a.property.ltvOnCost !== null || a.property.ltvOnMarket !== null) facts.push(["Loan against cost / market value", `${a.property.ltvOnCost ?? "—"}% / ${a.property.ltvOnMarket ?? "—"}%`]);
  if (a.doubleWhammy) facts.push(["Repayment ratio + loan-to-value", `${a.doubleWhammy.total}% (limit ${a.doubleWhammy.limit}%)`]);
  if (a.dscr !== null) facts.push(["Debt service cover", String(a.dscr)]);
  if (a.ratios.currentRatio !== null) facts.push(["Current ratio", String(a.ratios.currentRatio)]);
  if (a.ratios.debtEquityAfter !== null) facts.push(["Debt to net worth after the loan", String(a.ratios.debtEquityAfter)]);
  if (a.workingCapital) facts.push(["Working-capital room (turnover method)", rupees(a.workingCapital.headroom)]);
  if (a.bankingProgram) facts.push(["Loan the average balance supports", rupees(a.bankingProgram.eligible)]);

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-navy">What the numbers say</h2>
          <p className="text-[12px] text-muted">Worked out from what is saved so far. The Excel has every workings sheet.</p>
        </div>
        {a.scorecard.grade && (
          <div className="flex items-center gap-2" title={a.scorecard.note}>
            <span className={clsx("grid h-10 w-10 place-items-center rounded-lg text-lg font-bold text-white", GRADE_TONE[a.scorecard.grade])}>{a.scorecard.grade}</span>
            <div className="text-[12px] leading-tight"><strong className="text-navy">{a.scorecard.percent}%</strong><br /><span className="text-muted">our indicative score</span></div>
          </div>
        )}
      </div>

      {nothing ? (
        <p className="text-[13px] text-muted">Fill in the income, loan and loans-running sections and the figures will appear here.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="data-table">
              <tbody>{facts.map(([k, v]) => <tr key={k}><td className="font-semibold text-navy">{k}</td><td className="num text-ink">{v}</td></tr>)}</tbody>
            </table>
          </div>

          {a.flags.length > 0 && (
            <ul className="space-y-1.5">
              {a.flags.map((f, i) => (
                <li key={i} className={clsx("flex gap-2 rounded-md px-3 py-2 text-[13px]", TONE[f.level])}>
                  <strong className="w-10 shrink-0">{LABEL[f.level]}</strong><span>{f.text}</span>
                </li>
              ))}
            </ul>
          )}

          {a.programs.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">Ways the income can be taken</h3>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="data-table">
                  <thead><tr><th>Program</th><th className="num">A year</th><th className="num">A month</th><th>How</th></tr></thead>
                  <tbody>
                    {a.programs.map((p) => (
                      <tr key={p.key} className={p.label === a.program.highest ? "!bg-emerald-50" : undefined}>
                        <td className="font-semibold text-navy whitespace-nowrap">{p.label}{p.label === a.program.chosen ? " (used)" : ""}</td>
                        <td className="num">{rupees(p.annual)}</td>
                        <td className="num">{rupees(p.annual === null ? null : p.annual / 12)}</td>
                        <td className="wrap text-muted">{p.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-muted">Green is the highest. Pick another in "Staff assessment" to use it for the repayment capacity.</p>
            </div>
          )}

          {a.scorecard.items.length > 0 && (
            <details className="rounded-md border border-line text-[13px]">
              <summary className="cursor-pointer px-3 py-2 font-semibold text-navy">How the score was worked out ({a.scorecard.items.length} tests)</summary>
              <div className="border-t border-line">
                <table className="data-table">
                  <thead><tr><th>Test</th><th>This case</th><th className="num">Points</th></tr></thead>
                  <tbody>{a.scorecard.items.map((s) => <tr key={s.name}><td className="wrap text-navy">{s.name}</td><td className="whitespace-nowrap">{s.value}</td><td className={clsx("num font-semibold", s.points < 0 ? "text-red-700" : s.points === 0 ? "text-amber-700" : "text-emerald-700")}>{s.points > 0 ? `+${s.points}` : s.points}</td></tr>)}</tbody>
                </table>
                <p className="px-3 py-2 text-[11px] text-muted">{a.scorecard.note}</p>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
