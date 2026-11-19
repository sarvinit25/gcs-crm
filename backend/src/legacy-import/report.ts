import { applicationCandidate, type StagedPerson, type StagedRow } from "./clean";

/** The review report for a staging run: counts only, so it can be read, shared and kept without customer details. */
export type StageReport = {
  sheetRows: number;
  people: number;
  mergedAway: number;
  byCategory: Record<"LIVE" | "DEAD" | "NEEDS_PHONE", number>;
  doNotCall: number;
  deadReasons: Record<string, number>;
  byBatch: { batch: string; people: number; live: number; dead: number; needsPhone: number }[];
  product: { mapped: number; unmapped: number; unmappedTop: [string, number][] };
  amount: { usable: number; blank: number; flagged: Record<string, number> };
  outcomes: Record<string, number>;
  applications: { total: number; complete: number; byStatus: Record<string, number>; missing: Record<string, number> };
  contacts: { withTwoOrMoreMobiles: number };
  history: { entries: number; byCaller: Record<string, number>; followUpsKept: number };
  other: { withCredit: number; withPan: number; withoutDate: number; withCity: number };
};

const bump = (m: Record<string, number>, k: string, by = 1) => void (m[k] = (m[k] ?? 0) + by);
const sortObj = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));

export function buildReport(rows: StagedRow[], people: StagedPerson[]): StageReport {
  const byCategory = { LIVE: 0, DEAD: 0, NEEDS_PHONE: 0 };
  const deadReasons: Record<string, number> = {};
  const batches = new Map<string, { people: number; live: number; dead: number; needsPhone: number }>();
  const unmapped: Record<string, number> = {};
  const flagged: Record<string, number> = {};
  const outcomes: Record<string, number> = {};
  const apps = { total: 0, complete: 0, byStatus: {} as Record<string, number>, missing: {} as Record<string, number> };
  const byCaller: Record<string, number> = {};
  let mapped = 0;
  let usable = 0;
  let blank = 0;
  let doNotCall = 0;
  let entries = 0;

  for (const p of people) {
    byCategory[p.category] += 1;
    if (p.doNotCall) doNotCall += 1;
    if (p.deadReason) bump(deadReasons, p.deadReason);
    const b = p.batches[0] ?? "OTHER CASES";
    const row = batches.get(b) ?? { people: 0, live: 0, dead: 0, needsPhone: 0 };
    row.people += 1;
    if (p.category === "LIVE") row.live += 1;
    else if (p.category === "DEAD") row.dead += 1;
    else row.needsPhone += 1;
    batches.set(b, row);

    if (p.product) mapped += 1;
    else bump(unmapped, rows.find((r) => p.lines.includes(r.line))?.productRaw || "(blank)");
    if (p.amount !== undefined) usable += 1;
    else if (p.amountFlags.length) for (const f of p.amountFlags) bump(flagged, f);
    else blank += 1;
    if (p.outcome) bump(outcomes, p.outcome);
    const app = applicationCandidate(p);
    if (app) {
      apps.total += 1;
      if (app.complete) apps.complete += 1;
      bump(apps.byStatus, app.status);
      for (const m of app.missing) bump(apps.missing, m);
    }
    for (const h of p.history) {
      entries += 1;
      bump(byCaller, h.caller ?? "(nobody recorded)");
    }
  }

  return {
    sheetRows: rows.length,
    people: people.length,
    mergedAway: rows.length - people.length,
    byCategory,
    doNotCall,
    deadReasons: sortObj(deadReasons),
    byBatch: [...batches].map(([batch, v]) => ({ batch, ...v })).sort((a, b) => b.people - a.people),
    product: { mapped, unmapped: people.length - mapped, unmappedTop: Object.entries(sortObj(unmapped)).slice(0, 12) },
    amount: { usable, blank, flagged: sortObj(flagged) },
    outcomes: sortObj(outcomes),
    applications: { ...apps, byStatus: sortObj(apps.byStatus), missing: sortObj(apps.missing) },
    contacts: { withTwoOrMoreMobiles: people.filter((p) => p.mobiles.length > 1).length },
    history: { entries, byCaller: sortObj(byCaller), followUpsKept: people.filter((p) => p.followUpAt).length },
    other: { withCredit: people.filter((p) => Object.keys(p.credit).length).length, withPan: people.filter((p) => p.pan).length, withoutDate: people.filter((p) => !p.createdAt).length, withCity: people.filter((p) => p.city).length },
  };
}

const n = (x: number) => x.toLocaleString("en-IN");
const table = (head: string[], body: (string | number)[][]) => [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");

export function reportMarkdown(r: StageReport, sheetName: string, notes: string[] = []): string {
  return `# Staging report: ${sheetName}

Counts only. Nothing here identifies a customer, and nothing has been changed in the CRM.
${notes.length ? `\n${notes.map((x) => `- ${x}`).join("\n")}\n` : ""}
## Totals
- Rows read from the sheet: **${n(r.sheetRows)}**
- People after merging on mobile: **${n(r.people)}** (${n(r.mergedAway)} rows were repeats of someone already counted)
- **Live leads** (to work): ${n(r.byCategory.LIVE)}
- **Archived history** (not interested, wrong number, do not disturb): ${n(r.byCategory.DEAD)}, of which ${n(r.doNotCall)} are do-not-call
- **Needs phone** (no usable mobile): ${n(r.byCategory.NEEDS_PHONE)}

## Why leads are archived
${table(["Reason", "People"], Object.entries(r.deadReasons).map(([k, v]) => [k, n(v)]))}

## By source batch
${table(["Batch", "People", "Live", "Archived", "Needs phone"], r.byBatch.slice(0, 25).map((b) => [b.batch, n(b.people), n(b.live), n(b.dead), n(b.needsPhone)]))}

## Loan product
- Mapped to a CRM product: ${n(r.product.mapped)}; left blank: ${n(r.product.unmapped)}
${table(["Sheet value left unmapped", "People"], r.product.unmappedTop.map(([k, v]) => [k, n(v)]))}

## Amounts
- Usable: ${n(r.amount.usable)}; blank: ${n(r.amount.blank)}; not trusted: ${Object.entries(r.amount.flagged).map(([k, v]) => `${k} ${n(v)}`).join(", ") || "none"}

## Case outcomes and application records
- Outcomes in the sheet: ${Object.entries(r.outcomes).map(([k, v]) => `${k} ${n(v)}`).join(", ") || "none"}
- Application records to create (old Shriram cases, archived): **${n(r.applications.total)}**, of which **${n(r.applications.complete)}** are complete (${Object.entries(r.applications.byStatus).map(([k, v]) => `${k} ${n(v)}`).join(", ")})
- Missing on the incomplete ones: ${Object.entries(r.applications.missing).map(([k, v]) => `${k} ${n(v)}`).join(", ") || "nothing"}

## History and contacts
- Call history entries: ${n(r.history.entries)}; by caller: ${Object.entries(r.history.byCaller).map(([k, v]) => `${k} ${n(v)}`).join(", ")}
- Future follow-ups kept: ${n(r.history.followUpsKept)}
- People with two or more mobiles: ${n(r.contacts.withTwoOrMoreMobiles)}
- With credit figures: ${n(r.other.withCredit)}; with a PAN: ${n(r.other.withPan)}; with a city: ${n(r.other.withCity)}; with no entry date: ${n(r.other.withoutDate)}
`;
}
