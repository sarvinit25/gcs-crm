-- DropIndex
DROP INDEX "Application_applicationNo_key";

-- AlterTable
ALTER TABLE "Application" DROP COLUMN "applicationNo",
ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Application_seq_key" ON "Application"("seq");

