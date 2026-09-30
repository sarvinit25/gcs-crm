-- AlterTable
ALTER TABLE "SourcingPartner" ADD COLUMN     "code" TEXT,
ADD COLUMN     "managerId" TEXT;

-- Backfill codes for existing partners, oldest first
UPDATE "SourcingPartner" p SET "code" = 'GCS-BSA-' || LPAD(n.rn::text, 3, '0')
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn FROM "SourcingPartner") n
WHERE p.id = n.id;

-- CreateIndex
CREATE UNIQUE INDEX "SourcingPartner_code_key" ON "SourcingPartner"("code");

-- AddForeignKey
ALTER TABLE "SourcingPartner" ADD CONSTRAINT "SourcingPartner_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
