/**
 * The arithmetic behind the marketing report, kept apart from the database so it can be checked on its own.
 * A "cohort" is the leads created in the period; each downstream stage counts those same leads,
 * whenever they reached it — so a lead from March that is disbursed in June still counts for March.
 */
export type CohortRow = {
  key: string;
  channel: string | null;
  campaign: string | null;
  leads: number;
  qualified: number;
  lost: number;
  applications: number;
  sanctioned: number;
  disbursed: number;
  disbursedAmount: number;
  commission: number;
};

export type SpendRow = { key: string; channel: string | null; campaign: string | null; spend: number };

export type PerformanceRow = CohortRow & {
  spend: number;
  costPerLead: number | null;
  costPerQualified: number | null;
  costPerApplication: number | null;
  costPerDisbursal: number | null;
  qualifiedRate: number | null;
  applicationRate: number | null;
  disbursalRate: number | null;
  /** Commission earned for every rupee spent; only meaningful when something was spent. */
  returnOnSpend: number | null;
};

const ratio = (a: number, b: number, digits = 2): number | null => (b > 0 ? Number((a / b).toFixed(digits)) : null);
const pct = (a: number, b: number): number | null => (b > 0 ? Number(((a / b) * 100).toFixed(1)) : null);

export const emptyCohort = (key: string, channel: string | null, campaign: string | null): CohortRow => ({
  key, channel, campaign, leads: 0, qualified: 0, lost: 0, applications: 0, sanctioned: 0, disbursed: 0, disbursedAmount: 0, commission: 0,
});

/** Adds the cost and rate figures to a row once its spend is known. */
export function withMetrics(row: CohortRow, spend: number): PerformanceRow {
  const s = Number(spend.toFixed(2));
  return {
    ...row,
    spend: s,
    costPerLead: ratio(s, row.leads),
    costPerQualified: ratio(s, row.qualified),
    costPerApplication: ratio(s, row.applications),
    costPerDisbursal: ratio(s, row.disbursed),
    qualifiedRate: pct(row.qualified, row.leads),
    applicationRate: pct(row.applications, row.leads),
    disbursalRate: pct(row.disbursed, row.leads),
    returnOnSpend: s > 0 ? ratio(row.commission, s) : null,
  };
}

/**
 * Lays spend alongside the cohort rows. Spend on something that produced no leads at all
 * (a hoarding that brought nobody in) still gets a row — that is exactly what you want to see.
 */
export function mergeSpend(cohorts: CohortRow[], spends: SpendRow[]): PerformanceRow[] {
  const spendByKey = new Map<string, number>();
  for (const s of spends) spendByKey.set(s.key, (spendByKey.get(s.key) ?? 0) + s.spend);

  const rows = cohorts.map((c) => withMetrics(c, spendByKey.get(c.key) ?? 0));
  const seen = new Set(cohorts.map((c) => c.key));
  for (const s of spends) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    rows.push(withMetrics(emptyCohort(s.key, s.channel, s.campaign), spendByKey.get(s.key) ?? 0));
  }
  return rows;
}

export function totalOf(rows: PerformanceRow[]): PerformanceRow {
  const sum = emptyCohort("total", null, null);
  let spend = 0;
  for (const r of rows) {
    spend += r.spend;
    for (const k of ["leads", "qualified", "lost", "applications", "sanctioned", "disbursed", "disbursedAmount", "commission"] as const) sum[k] += r[k];
  }
  return withMetrics(sum, spend);
}

export type FunnelStage = { stage: string; count: number; /** Share of the first stage that got this far. */ ofLeads: number | null; /** Share of the previous stage that carried on. */ ofPrevious: number | null };

export function funnelOf(t: Pick<CohortRow, "leads" | "qualified" | "applications" | "sanctioned" | "disbursed">): FunnelStage[] {
  const stages: [string, number][] = [
    ["Leads", t.leads],
    ["Qualified", t.qualified],
    ["Applications", t.applications],
    ["Sanctioned", t.sanctioned],
    ["Disbursed", t.disbursed],
  ];
  return stages.map(([stage, count], i) => ({
    stage,
    count,
    ofLeads: pct(count, t.leads),
    ofPrevious: i === 0 ? null : pct(count, stages[i - 1][1]),
  }));
}

/** Best first: lowest cost per qualified lead, with channels that cost nothing or have no qualified leads last. */
export function sortRows(rows: PerformanceRow[]): PerformanceRow[] {
  return [...rows].sort((a, b) => b.leads - a.leads || b.spend - a.spend || a.key.localeCompare(b.key));
}

export const NOT_TRACKED = "Not tracked";
export const NO_CAMPAIGN = "No campaign";
