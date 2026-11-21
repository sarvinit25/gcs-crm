/**
 * Phase 2 of the old-workbook import: turn one cleaned person (see clean.ts) into the rows the CRM will hold.
 * Pure functions only, so the mapping is tested without a database; prisma/legacy-import.ts does the writing.
 * Rules and decisions are in docs/DATA-MIGRATION.md.
 */
import { applicationCandidate, type StagedPerson } from "./clean";

export const LEGACY_SOURCE = "Legacy calling sheet";
/** Imported files take sequence numbers from here up, so they never use up the live GCS-2026-nnnn references. */
export const LEGACY_SEQ_BASE = 900000;
const REMARK_MAX = 500;
const NOTES_MAX = 1000;

export type LeadPlan = {
  name: string;
  phone: string;
  secondaryPhone?: string;
  city?: string;
  productSlug?: string;
  amount?: number;
  source: string;
  channel: string;
  companyName?: string;
  employerName?: string;
  designation?: string;
  pan?: string;
  address?: string;
  status: "NEW" | "CONTACTED" | "LOST";
  lostReason?: string;
  archivedAt?: Date;
  createdAt?: Date;
  nextFollowUpAt?: Date;
  doNotCall: boolean;
  notes?: string;
  legacyRef: string;
  importBatch: string;
};

export type FollowUpPlan = { note: string; at?: Date };
export type ApplicationPlan = { status: "DISBURSED" | "REJECTED"; lenderName: string; productSlug: string; amount: number; createdAt: Date };
export type PersonPlan = { lead: LeadPlan; followUps: FollowUpPlan[]; application?: ApplicationPlan; applicationSkipped?: string[] };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const clean = (s?: string) => (s && s.trim() ? s.trim() : undefined);

/** Where this person sits in the old sheet: the first reference the sheet gave, else its first row. */
export function legacyRefOf(p: StagedPerson): string {
  return p.refs[0] ? `ref:${p.refs[0]}` : `row:${p.lines[0]}`;
}

export function planPerson(p: StagedPerson, importBatch: string, now: Date): PersonPlan {
  const history = p.history.filter((h) => h.remark.trim());
  const followUps = history.map((h) => ({ at: h.at, note: clip(`${h.caller ? `[${h.caller}] ` : ""}${h.remark.trim()}`, REMARK_MAX) }));
  const last = history[history.length - 1];
  const dead = p.category === "DEAD";

  const lead: LeadPlan = {
    name: p.name || "Unknown",
    phone: p.key ?? "", // the column is required; a person with no number carries "" and sits in the Needs phone batch
    secondaryPhone: p.mobiles.find((m) => m !== p.key),
    city: clean(p.city),
    productSlug: p.product,
    amount: p.amount,
    source: LEGACY_SOURCE,
    channel: p.batches.join(", "),
    companyName: clean(p.company),
    employerName: clean(p.company),
    designation: clean(p.designation),
    pan: p.pan,
    address: clean(p.resiAddr) ?? clean(p.officeAddr),
    status: dead ? "LOST" : history.length ? "CONTACTED" : "NEW",
    lostReason: dead ? p.deadReason : undefined,
    archivedAt: dead ? (last?.at ?? now) : undefined,
    createdAt: p.createdAt,
    // A follow-up date already in the past would flood Reminders on day one, so only a future one is carried over.
    nextFollowUpAt: !dead && p.followUpAt && p.followUpAt > now ? p.followUpAt : undefined,
    doNotCall: p.doNotCall,
    notes: last ? clip(last.remark.trim(), NOTES_MAX) : undefined,
    legacyRef: legacyRefOf(p),
    importBatch,
  };

  const cand = applicationCandidate(p);
  if (!cand) return { lead, followUps };
  if (!cand.complete || !cand.product || cand.amount === undefined || !p.createdAt) return { lead, followUps, applicationSkipped: cand.missing };
  return {
    lead,
    followUps,
    application: { status: cand.status as "DISBURSED" | "REJECTED", lenderName: "Shriram Finance", productSlug: cand.product, amount: cand.amount, createdAt: p.createdAt },
  };
}

export type BatchSummary = { people: number; byCategory: Record<string, number>; withHistory: number; followUps: number; applications: number; applicationsSkipped: number; doNotCall: number };

export function summarise(plans: PersonPlan[], categories: string[]): BatchSummary {
  const byCategory: Record<string, number> = {};
  categories.forEach((c) => (byCategory[c] = (byCategory[c] ?? 0) + 1));
  return {
    people: plans.length,
    byCategory,
    withHistory: plans.filter((x) => x.followUps.length).length,
    followUps: plans.reduce((n, x) => n + x.followUps.length, 0),
    applications: plans.filter((x) => x.application).length,
    applicationsSkipped: plans.filter((x) => x.applicationSkipped).length,
    doNotCall: plans.filter((x) => x.lead.doNotCall).length,
  };
}
