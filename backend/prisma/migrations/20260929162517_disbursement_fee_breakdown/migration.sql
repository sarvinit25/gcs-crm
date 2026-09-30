-- CreateEnum
CREATE TYPE "RoiType" AS ENUM ('FIXED', 'FLOATING');

-- AlterTable
ALTER TABLE "Disbursement" ADD COLUMN     "documentationCharges" DECIMAL(14,2),
ADD COLUMN     "insuranceAmount" DECIMAL(14,2),
ADD COLUMN     "loanAccountNo" TEXT,
ADD COLUMN     "processingFee" DECIMAL(14,2),
ADD COLUMN     "roiType" "RoiType",
ADD COLUMN     "stampDuty" DECIMAL(14,2);
