/**
 * Phase 2/3 of bringing the firm's old calling workbook into the CRM: read the cleaned people written by legacy:stage
 * and create leads, follow-up history and the Shriram case files. See docs/DATA-MIGRATION.md.
 *
 *   npm run legacy:import -- --people <folder>/people.jsonl --batch <name> --user <staff email>           (dry run)
 *   npm run legacy:import -- ... --limit 200 --commit                                                     (pilot)
 *   npm run legacy:import -- ... --commit                                                                 (everything)
 *   npm run legacy:import -- --batch <name> --rollback --commit                                           (undo one batch)
 *
 * Without --commit nothing is written. Safe to run twice: a person already imported (same legacyRef) or already in the
 * CRM with the same mobile is skipped, never duplicated or overwritten. people.jsonl holds customer details and must stay
 * outside this project.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { StagedPerson } from "../src/legacy-import/clean";
import { LEGACY_SEQ_BASE, planPerson, summarise, type PersonPlan } from "../src/legacy-import/plan";

const prisma = new PrismaClient();
const CHUNK = 500;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** people.jsonl stores dates as text; turn them back into dates. */
function revive(line: string): StagedPerson {
  const p = JSON.parse(line);
  const d = (v?: string) => (v ? new Date(v) : undefined);
  return { ...p, createdAt: d(p.createdAt), followUpAt: d(p.followUpAt), history: p.history.map((h: { at?: string }) => ({ ...h, at: d(h.at) })) };
}

async function rollback(batch: string, commit: boolean) {
  const apps = await prisma.application.count({ where: { importBatch: batch } });
  const leads = await prisma.lead.count({ where: { importBatch: batch } });
  console.log(`Batch "${batch}": ${leads} leads and ${apps} applications would be removed (follow-ups and applicants go with them).`);
  if (!commit) return console.log("Dry run. Add --commit to remove them.");
  await prisma.$transaction(async (tx) => {
    await tx.application.deleteMany({ where: { importBatch: batch } });
    await tx.lead.deleteMany({ where: { importBatch: batch } });
  });
  console.log("Removed.");
}

async function main() {
  const batch = arg("batch");
  const commit = flag("commit");
  if (!batch) throw new Error("--batch <name> is required, e.g. --batch dcr-2026-11");
  if (flag("rollback")) return rollback(batch, commit);

  const file = arg("people");
  const email = arg("user");
  if (!file || !email) throw new Error("--people <people.jsonl> and --user <staff email> are required");
  const path = resolve(file);
  const project = resolve(process.cwd(), "..");
  if (path.startsWith(project + sep)) throw new Error("people.jsonl is inside the project folder; keep customer details outside it.");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No staff user with email ${email}; follow-up history is recorded against this user.`);

  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  let people = readFileSync(path, "utf8").split("\n").filter(Boolean).map(revive);
  if (limit) people = people.slice(0, limit);

  const now = new Date();
  const existing = await prisma.lead.findMany({ where: { OR: [{ legacyRef: { not: null } }, { phone: { not: "" } }] }, select: { phone: true, legacyRef: true, importBatch: true } });
  const refs = new Set(existing.filter((l) => l.legacyRef).map((l) => l.legacyRef));
  const phones = new Set(existing.map((l) => l.phone));

  const [products, lenders] = await Promise.all([prisma.loanProduct.findMany({ select: { id: true, slug: true } }), prisma.lender.findMany({ select: { id: true, name: true } })]);
  const productId = new Map(products.map((p) => [p.slug, p.id]));
  const lenderId = new Map(lenders.map((l) => [l.name, l.id]));

  const plans: { plan: PersonPlan; person: StagedPerson }[] = [];
  let already = 0;
  let inCrm = 0;
  for (const person of people) {
    const plan = planPerson(person, batch, now);
    if (refs.has(plan.lead.legacyRef)) already += 1;
    else if (plan.lead.phone && phones.has(plan.lead.phone)) inCrm += 1;
    else plans.push({ plan, person });
  }

  const s = summarise(plans.map((x) => x.plan), plans.map((x) => x.person.category));
  const missingProducts = new Set(plans.flatMap((x) => [x.plan.lead.productSlug, x.plan.application?.productSlug]).filter((x): x is string => !!x && !productId.has(x)));
  console.log(JSON.stringify({ batch, mode: commit ? "COMMIT" : "DRY RUN", read: people.length, alreadyImported: already, alreadyInCrmByMobile: inCrm, toCreate: s, productsNotInCrm: [...missingProducts] }, null, 2));
  if (!commit) return console.log("Dry run: nothing was written. Add --commit to import.");

  const maxSeq = (await prisma.application.aggregate({ _max: { seq: true } }))._max.seq ?? 0;
  let seq = Math.max(maxSeq, LEGACY_SEQ_BASE);
  let leadsMade = 0;
  let appsMade = 0;

  for (let i = 0; i < plans.length; i += CHUNK) {
    const chunk = plans.slice(i, i + CHUNK);
    await prisma.$transaction(async (tx) => {
      const ids = chunk.map(() => randomUUID());
      await tx.lead.createMany({
        data: chunk.map(({ plan: { lead: l } }, k) => ({
          id: ids[k], name: l.name, phone: l.phone, secondaryPhone: l.secondaryPhone, city: l.city,
          loanProductId: l.productSlug ? productId.get(l.productSlug) : undefined, amount: l.amount,
          source: l.source, channel: l.channel, companyName: l.companyName, employerName: l.employerName, designation: l.designation,
          pan: l.pan, address: l.address, status: l.status, lostReason: l.lostReason, archivedAt: l.archivedAt,
          ...(l.createdAt ? { createdAt: l.createdAt } : {}), nextFollowUpAt: l.nextFollowUpAt, doNotCall: l.doNotCall,
          notes: l.notes, legacyRef: l.legacyRef, importBatch: l.importBatch,
        })),
      });
      leadsMade += chunk.length;

      const followUps = chunk.flatMap(({ plan }, k) => plan.followUps.map((f) => ({ leadId: ids[k], userId: user.id, note: f.note, dueAt: f.at, doneAt: f.at, ...(f.at ? { createdAt: f.at } : {}) })));
      if (followUps.length) await tx.followUp.createMany({ data: followUps });

      for (const [k, { plan, person }] of chunk.entries()) {
        const a = plan.application;
        const pid = a && productId.get(a.productSlug);
        const lid = a && lenderId.get(a.lenderName);
        if (!a || !pid) continue;
        seq += 1;
        await tx.application.create({
          data: {
            seq, leadId: ids[k], loanProductId: pid, lenderId: lid, requestedAmount: a.amount, status: a.status,
            archivedAt: now, createdAt: a.createdAt, importBatch: batch,
            applicants: { create: { isPrimary: true, name: person.name, phone: person.key, pan: person.pan, city: person.city, employerName: person.company || undefined } },
          },
        });
        appsMade += 1;
      }
    }, { timeout: 120000 });
    console.log(`  ${Math.min(i + CHUNK, plans.length)} / ${plans.length}`);
  }
  console.log(`Done. ${leadsMade} leads and ${appsMade} applications created in batch "${batch}". Undo with --batch ${batch} --rollback --commit.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
