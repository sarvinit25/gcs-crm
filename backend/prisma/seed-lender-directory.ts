import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LenderContactKind, LenderType, Prisma, PrismaClient } from "@prisma/client";

type DirContact = {
  lender: string; name: string; designation?: string; phone?: string; altPhone?: string; email?: string; segments?: string[];
  kind?: "RELATIONSHIP" | "DIRECTORY"; city?: string; state?: string; region?: string; branch?: string; coverage?: string[];
  employeeCode?: string; escalation?: { role: string | null; name: string; phone: string | null; email: string | null }[];
  details?: Record<string, string>; notes?: string; active?: boolean; sources?: string[];
};
type DirCode = {
  lender: string; product: string; productLink?: string; code?: string; registeredName?: string; payoutText?: string;
  payoutPercent?: number; contactText?: string; contactPhone?: string; specialCondition?: string; source?: string;
};
type DirBranch = {
  lender: string; name: string; city?: string; state?: string; region?: string; zone?: string; area?: string;
  dsaSourcing?: string; details?: Record<string, string | null>; source?: string;
};
type Directory = {
  lenders: { name: string; type: "BANK" | "NBFC"; notes: string | null }[];
  contacts: DirContact[]; codes: DirCode[]; branches: DirBranch[];
};

const low = (s?: string | null) => (s ?? "").trim().toLowerCase();
const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Loads the banker / SPOC / code-and-payout workbooks (see tools/lender-directory). Safe to run again:
 * people, codes and branches already in the CRM are left exactly as they are, so edits made there survive.
 */
export async function seedLenderDirectory(prisma: PrismaClient) {
  const data: Directory = JSON.parse(readFileSync(join(__dirname, "lender-directory-data.json"), "utf8"));

  // Lenders — new ones are internal only, never on the public website.
  const existing = new Map((await prisma.lender.findMany({ select: { id: true, name: true, notes: true } })).map((l) => [l.name, l]));
  let newLenders = 0;
  for (const [i, l] of data.lenders.entries()) {
    const cur = existing.get(l.name);
    if (!cur) {
      const made = await prisma.lender.create({
        data: { name: l.name, type: l.type === "BANK" ? LenderType.BANK : LenderType.NBFC, isPublic: false, sortOrder: 200 + i, notes: l.notes },
      });
      existing.set(l.name, { id: made.id, name: made.name, notes: made.notes });
      newLenders++;
    } else if (l.notes && !(cur.notes ?? "").includes(l.notes)) {
      await prisma.lender.update({ where: { id: cur.id }, data: { notes: [cur.notes, l.notes].filter(Boolean).join("\n") } });
    }
  }
  const lenderId = (name: string) => {
    const l = existing.get(name);
    if (!l) throw new Error(`Lender missing from the directory data: ${name}`);
    return l.id;
  };

  // People
  const have = await prisma.lenderContact.findMany({ select: { lenderId: true, phone: true, email: true, name: true, city: true } });
  const keys = new Set<string>();
  for (const c of have) {
    if (c.phone) keys.add(`${c.lenderId}|p|${c.phone}`);
    if (c.email) keys.add(`${c.lenderId}|e|${c.email}`);
    keys.add(`${c.lenderId}|n|${low(c.name)}|${low(c.city)}`);
  }
  const fresh: Prisma.LenderContactCreateManyInput[] = [];
  for (const c of data.contacts) {
    const lid = lenderId(c.lender);
    const k = [c.phone && `${lid}|p|${c.phone}`, c.email && `${lid}|e|${c.email}`, `${lid}|n|${low(c.name)}|${low(c.city)}`].filter(Boolean) as string[];
    if (k.some((x) => keys.has(x))) continue;
    k.forEach((x) => keys.add(x));
    fresh.push({
      lenderId: lid, name: c.name, designation: c.designation ?? null, phone: c.phone ?? null, altPhone: c.altPhone ?? null,
      email: c.email ?? null, segments: c.segments ?? [], notes: c.notes ?? null, active: c.active ?? true,
      kind: c.kind === "DIRECTORY" ? LenderContactKind.DIRECTORY : LenderContactKind.RELATIONSHIP,
      city: c.city ?? null, state: c.state ?? null, region: c.region ?? null, branch: c.branch ?? null,
      coverage: c.coverage?.length ? c.coverage.join(" · ") : null, employeeCode: c.employeeCode ?? null,
      escalation: c.escalation?.length ? (c.escalation as Prisma.InputJsonValue) : Prisma.DbNull,
      details: c.details && Object.keys(c.details).length ? (c.details as Prisma.InputJsonValue) : Prisma.DbNull,
      source: (c.sources ?? []).slice(0, 3).join(" | ") || null,
    });
  }
  for (const part of chunk(fresh, 500)) await prisma.lenderContact.createMany({ data: part });

  // Broker codes and payouts
  const products = new Map((await prisma.loanProduct.findMany({ select: { id: true, name: true } })).map((p) => [p.name, p.id]));
  const haveCodes = new Set((await prisma.lenderCode.findMany({ select: { lenderId: true, product: true, code: true } })).map((c) => `${c.lenderId}|${low(c.product)}|${low(c.code)}`));
  let codesAdded = 0;
  for (const c of data.codes) {
    const lid = lenderId(c.lender);
    const k = `${lid}|${low(c.product)}|${low(c.code)}`;
    if (haveCodes.has(k)) continue;
    haveCodes.add(k);
    await prisma.lenderCode.create({
      data: {
        lenderId: lid, product: c.product, loanProductId: (c.productLink && products.get(c.productLink)) || null, code: c.code ?? null,
        registeredName: c.registeredName ?? null, payoutText: c.payoutText ?? null, payoutPercent: c.payoutPercent ?? null,
        contactText: c.contactText ?? null, contactPhone: c.contactPhone ?? null, specialCondition: c.specialCondition ?? null, source: c.source ?? null,
      },
    });
    codesAdded++;
  }
  // A lender that has one code for everything shows it as its broker code.
  for (const l of existing.values()) {
    const codes = [...new Set(data.codes.filter((c) => c.lender === l.name && c.code).map((c) => c.code!))];
    if (codes.length === 1) await prisma.lender.updateMany({ where: { id: l.id, brokerCode: null }, data: { brokerCode: codes[0] } });
  }

  // Branches
  const haveBranches = new Set((await prisma.lenderBranch.findMany({ select: { lenderId: true, name: true, state: true, area: true } })).map((b) => `${b.lenderId}|${low(b.name)}|${low(b.state)}|${low(b.area)}`));
  const freshBranches: Prisma.LenderBranchCreateManyInput[] = [];
  for (const b of data.branches) {
    const lid = lenderId(b.lender);
    const k = `${lid}|${low(b.name)}|${low(b.state)}|${low(b.area)}`;
    if (haveBranches.has(k)) continue;
    haveBranches.add(k);
    const details = Object.fromEntries(Object.entries(b.details ?? {}).filter(([, v]) => v));
    freshBranches.push({
      lenderId: lid, name: b.name, city: b.city ?? null, state: b.state ?? null, region: b.region ?? null, zone: b.zone ?? null,
      area: b.area ?? null, dsaSourcing: b.dsaSourcing ?? null, details: Object.keys(details).length ? (details as Prisma.InputJsonValue) : Prisma.DbNull, source: b.source ?? null,
    });
  }
  for (const part of chunk(freshBranches, 500)) await prisma.lenderBranch.createMany({ data: part });

  console.log(
    `Lender directory: ${newLenders} new lender(s), ${fresh.length} new people (${data.contacts.length - fresh.length} already present), ` +
      `${codesAdded} code(s), ${freshBranches.length} branch(es)`,
  );
}
