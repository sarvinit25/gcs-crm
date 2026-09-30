-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "portalAccessCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Application_portalAccessCode_key" ON "Application"("portalAccessCode");
