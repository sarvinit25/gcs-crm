/**
 * Adds the website's downloadable checklist PDFs to an existing database WITHOUT running the full
 * seed (which resets lenders, rate cards and products). Safe to run on production, and to re-run:
 * entries that already exist are left exactly as staff edited them.
 *
 *   npx ts-node prisma/seed-checklist-documents.ts
 */
import { PrismaClient } from "@prisma/client";
import { CHECKLIST_DOCUMENTS } from "./checklist-documents.data";

const prisma = new PrismaClient();

async function main() {
  let added = 0;
  for (const [i, [title, productSlug, variant, fileUrl]] of CHECKLIST_DOCUMENTS.entries()) {
    const id = `seed-checklist-doc-${i}`;
    const exists = await prisma.checklistDocument.findUnique({ where: { id } });
    if (exists) continue;
    await prisma.checklistDocument.create({
      data: { id, title, productSlug, variant, fileUrl, sortOrder: i },
    });
    added++;
  }
  console.log(`Checklist documents: ${added} added, ${CHECKLIST_DOCUMENTS.length - added} already present`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
