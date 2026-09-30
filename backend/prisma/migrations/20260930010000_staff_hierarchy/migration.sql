-- AlterTable
ALTER TABLE "User" ADD COLUMN     "commissionPercent" DECIMAL(5,2),
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "employeeCode" TEXT,
ADD COLUMN     "joinedAt" DATE,
ADD COLUMN     "reportsToId" TEXT;

-- Backfill codes for existing staff, oldest first
UPDATE "User" u SET "employeeCode" = 'GCS-EMP-' || LPAD(n.rn::text, 3, '0')
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn FROM "User") n
WHERE u.id = n.id;

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
