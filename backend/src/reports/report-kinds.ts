/**
 * The eight detailed reports behind the Reports hub: what each one counts, how its records are staged,
 * and which headline tiles it shows. The database reads live in ReportInsightsService; this file is the
 * part that says what the numbers mean, kept pure so it is easy to test.
 */
import { commissionBuckets, inMonthOf, type Item, type StageDef, type Tile } from "./report-aggregate";

export const REPORT_KINDS = ["leads", "callbacks", "files", "login-files", "sanctions", "disbursals", "rejects", "commissions"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const isReportKind = (value: string): value is ReportKind => (REPORT_KINDS as readonly string[]).includes(value);

export type KindDef = {
  kind: ReportKind;
  title: string;
  /** One line under the title on the hub card and the page. */
  blurb: string;
  /** Names the stage chart and table ("By stage", "By mode of payment"). */
  stageTitle: string;
  /** What the amount column holds, for the loan-type and stage tables. */
  amountLabel: string;
  stages: StageDef[];
  /** Commission figures: Admin and Manager only. */
  commission?: boolean;
  tiles: (items: Item[], now: Date) => Tile[];
};

/** Files still moving through the pipeline: everything not yet disbursed, rejected or withdrawn. */
export const ACTIVE_FILE_STATUSES = ["DRAFT", "SUBMITTED", "BANK_LOGIN", "UNDER_REVIEW", "SANCTIONED"] as const;

const count = (items: Item[], pred: (i: Item) => boolean) => items.filter(pred).length;
const sum = (items: Item[], pred: (i: Item) => boolean = () => true) => items.reduce((s, i) => (pred(i) ? s + i.amount : s), 0);
const tile = (label: string, value: number, kind: Tile["kind"] = "count"): Tile => ({ label, value, kind });

const FILE_STAGES: StageDef[] = [
  { key: "DRAFT", label: "Draft" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "BANK_LOGIN", label: "Bank login" },
  { key: "UNDER_REVIEW", label: "Under review" },
  { key: "SANCTIONED", label: "Sanctioned" },
  { key: "DISBURSED", label: "Disbursed" },
  { key: "REJECTED", label: "Rejected" },
  { key: "WITHDRAWN", label: "Withdrawn" },
];

/** Where a rejected file fell: the stage it had reached when it was turned down. */
export const REJECT_STAGES: StageDef[] = [
  { key: "BEFORE_LOGIN", label: "Before bank login" },
  { key: "AFTER_LOGIN", label: "After bank login" },
  { key: "SANCTION_REJECTED", label: "Sanction rejected" },
];

export const FILE_STAGE_LABEL = Object.fromEntries(FILE_STAGES.map((s) => [s.key, s.label]));

export const KINDS: Record<ReportKind, KindDef> = {
  leads: {
    kind: "leads",
    title: "Leads",
    blurb: "Every enquiry, by status and source",
    stageTitle: "By status",
    amountLabel: "Loan amount",
    stages: [
      { key: "NEW", label: "New" },
      { key: "CONTACTED", label: "Contacted" },
      { key: "QUALIFIED", label: "Qualified" },
      { key: "DOCS_PENDING", label: "Docs pending" },
      { key: "CONVERTED", label: "Converted" },
      { key: "LOST", label: "Lost" },
    ],
    tiles: (items, now) => [
      tile("Total leads", items.length),
      tile("Open", count(items, (i) => i.stage !== "CONVERTED" && i.stage !== "LOST")),
      tile("Converted", count(items, (i) => i.stage === "CONVERTED")),
      tile("This month", count(items, (i) => inMonthOf(i.at, now))),
    ],
  },

  callbacks: {
    kind: "callbacks",
    title: "Callbacks",
    blurb: "Follow-ups booked with customers",
    stageTitle: "By follow-up status",
    amountLabel: "Loan amount",
    stages: [
      { key: "OVERDUE", label: "Overdue" },
      { key: "PENDING", label: "Upcoming" },
      { key: "DONE", label: "Done" },
    ],
    tiles: (items) => [
      tile("Total follow-ups", items.length),
      tile("Upcoming", count(items, (i) => i.stage === "PENDING")),
      tile("Overdue", count(items, (i) => i.stage === "OVERDUE")),
      tile("Done", count(items, (i) => i.stage === "DONE")),
    ],
  },

  files: {
    kind: "files",
    title: "Files",
    blurb: "Every case file, by pipeline stage",
    stageTitle: "File pipeline",
    amountLabel: "Requested amount",
    stages: FILE_STAGES,
    tiles: (items, now) => [
      tile("Total files", items.length),
      tile("Active", count(items, (i) => (ACTIVE_FILE_STATUSES as readonly string[]).includes(i.stage))),
      tile("This month", count(items, (i) => inMonthOf(i.at, now))),
      tile("Rejected", count(items, (i) => i.stage === "REJECTED")),
    ],
  },

  "login-files": {
    kind: "login-files",
    title: "Login files",
    blurb: "Files logged in with a bank",
    stageTitle: "Where logged-in files stand",
    amountLabel: "Requested amount",
    stages: FILE_STAGES.filter((s) => !["DRAFT", "SUBMITTED"].includes(s.key)),
    tiles: (items, now) => [
      tile("Files logged in", items.length),
      tile("Awaiting bank", count(items, (i) => i.stage === "BANK_LOGIN" || i.stage === "UNDER_REVIEW")),
      tile("Sanctioned or disbursed", count(items, (i) => i.stage === "SANCTIONED" || i.stage === "DISBURSED")),
      tile("Logged in this month", count(items, (i) => inMonthOf(i.at, now))),
    ],
  },

  sanctions: {
    kind: "sanctions",
    title: "Sanctions",
    blurb: "Sanctions from lenders",
    stageTitle: "By financial sanction",
    amountLabel: "Sanctioned amount",
    stages: [
      { key: "APPROVED", label: "Approved" },
      { key: "PENDING", label: "Pending" },
      { key: "REJECTED", label: "Rejected" },
    ],
    tiles: (items) => [
      tile("Total sanctions", items.length),
      tile("Approved", count(items, (i) => i.stage === "APPROVED")),
      tile("Pending", count(items, (i) => i.stage === "PENDING")),
      tile("Approved amount", sum(items, (i) => i.stage === "APPROVED"), "amount"),
    ],
  },

  disbursals: {
    kind: "disbursals",
    title: "Disbursals",
    blurb: "Money released by lenders",
    stageTitle: "By mode of payment",
    amountLabel: "Disbursed amount",
    stages: [
      { key: "RTGS", label: "RTGS" },
      { key: "NEFT", label: "NEFT" },
      { key: "IMPS", label: "IMPS" },
      { key: "UPI", label: "UPI" },
      { key: "CHEQUE", label: "Cheque" },
      { key: "DEMAND_DRAFT", label: "Demand draft" },
      { key: "OTHER", label: "Other" },
      { key: "UNSPECIFIED", label: "Not recorded" },
    ],
    tiles: (items, now) => [
      tile("Total disbursals", items.length),
      tile("Amount disbursed", sum(items), "amount"),
      tile("This month", sum(items, (i) => inMonthOf(i.at, now)), "amount"),
      tile("Part payouts", count(items, (i) => i.tag === "PART")),
    ],
  },

  rejects: {
    kind: "rejects",
    title: "Rejects",
    blurb: "Files turned down, and where",
    stageTitle: "Where files were rejected",
    amountLabel: "Requested amount",
    stages: REJECT_STAGES,
    tiles: (items, now) => [
      tile("Rejected files", items.length),
      tile("This month", count(items, (i) => inMonthOf(i.at, now))),
      tile("After bank login", count(items, (i) => i.stage === "AFTER_LOGIN" || i.stage === "SANCTION_REJECTED")),
      tile("Value rejected", sum(items), "amount"),
    ],
  },

  commissions: {
    kind: "commissions",
    title: "Commissions",
    blurb: "What lenders owe and have paid",
    stageTitle: "By payout status",
    amountLabel: "Gross commission",
    commission: true,
    stages: [
      { key: "PENDING", label: "Due" },
      { key: "CLAIMED", label: "Claimed" },
      { key: "PARTIAL", label: "Part received" },
      { key: "PAID", label: "Received" },
    ],
    tiles: (items) => {
      const b = commissionBuckets(items);
      return [tile("Gross commission", sum(items), "amount"), tile("Due", b.due, "amount"), tile("Claimed", b.claimed, "amount"), tile("Received", b.received, "amount")];
    },
  },
};

/** Which stage a rejected file belongs to. */
export function rejectStage(file: { bankLoginAt: Date | null; sanctionFinancialStatus: string | null }): string {
  if (file.sanctionFinancialStatus === "REJECTED") return "SANCTION_REJECTED";
  return file.bankLoginAt ? "AFTER_LOGIN" : "BEFORE_LOGIN";
}

/** A follow-up is done, overdue (due before now) or upcoming (due later, or with no date set). */
export function callbackStage(f: { doneAt: Date | null; dueAt: Date | null }, now: Date): string {
  if (f.doneAt) return "DONE";
  return f.dueAt && f.dueAt < now ? "OVERDUE" : "PENDING";
}
