// One-off: files the answers already sitting in old leads' notes as rows in LeadAnswer, and the partner
// forms' earlier sign-ups as PartnerApplication rows. Safe to run more than once; nothing is overwritten.
//   npm run backfill:answers
import { PrismaClient } from "@prisma/client";
import { answersFromDetail } from "../src/leads/lead-answers";

const PARTNER_FORMS: Record<string, string> = {
  "partner-enquiry": "agent",
  "partner-builder": "builder",
  "partner-freelancer": "freelancer",
};

async function main() {
  const prisma = new PrismaClient();
  let answers = 0;
  let applications = 0;
  const leads = await prisma.lead.findMany({
    where: { notes: { not: null } },
    select: { id: true, name: true, phone: true, email: true, city: true, source: true, notes: true, createdAt: true, _count: { select: { answers: true, partnerApplications: true } } },
  });
  for (const lead of leads) {
    const rows = answersFromDetail(lead.notes);
    if (lead._count.answers === 0) {
      for (const a of rows) {
        await prisma.leadAnswer.create({ data: { leadId: lead.id, stage: lead.source, key: a.key, label: a.label, value: a.value } });
        answers++;
      }
    }
    const kind = PARTNER_FORMS[lead.source];
    if (kind && lead._count.partnerApplications === 0) {
      const volumeKey = /refer|month|buyer|volume/;
      await prisma.partnerApplication.create({
        data: {
          kind,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          city: lead.city ?? rows.find((a) => a.key === "city")?.value,
          organisation: rows.find((a) => !/^(city|email|message)$/.test(a.key) && !volumeKey.test(a.key))?.value,
          volume: rows.find((a) => volumeKey.test(a.key))?.value.split(" — ")[0],
          message: lead.notes?.slice(0, 2000),
          leadId: lead.id,
          createdAt: lead.createdAt,
        },
      });
      applications++;
    }
  }
  console.log(`Filed ${answers} answers and ${applications} partner sign-ups from ${leads.length} leads.`);
  await prisma.$disconnect();
}

void main();
