-- CreateEnum
CREATE TYPE "DisbursalMode" AS ENUM ('RTGS', 'NEFT', 'IMPS', 'UPI', 'CHEQUE', 'DEMAND_DRAFT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtraCommissionSource" AS ENUM ('SUBVENTION', 'INSURANCE', 'CROSS_SELL', 'OTHER');

-- AlterEnum
ALTER TYPE "PayoutStatus" ADD VALUE 'CLAIMED';

-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "claimNote" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "receivedAmount" DECIMAL(14,2),
ADD COLUMN     "receivedRef" TEXT;

-- AlterTable
ALTER TABLE "Disbursement" ADD COLUMN     "accountNo" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "ifsc" TEXT,
ADD COLUMN     "mode" "DisbursalMode",
ADD COLUMN     "netAmount" DECIMAL(14,2),
ADD COLUMN     "otherDeductions" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Sanction" ADD COLUMN     "bankRm" TEXT,
ADD COLUMN     "commissionPercent" DECIMAL(5,2),
ADD COLUMN     "emiAmount" DECIMAL(14,2),
ADD COLUMN     "firstEmiDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "processingFee" DECIMAL(14,2),
ADD COLUMN     "processingFeePercent" DECIMAL(5,2),
ADD COLUMN     "sanctionDate" TIMESTAMP(3),
ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "CommissionExtra" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "source" "ExtraCommissionSource" NOT NULL,
    "note" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionExtra_commissionId_idx" ON "CommissionExtra"("commissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Sanction_seq_key" ON "Sanction"("seq");

-- AddForeignKey
ALTER TABLE "CommissionExtra" ADD CONSTRAINT "CommissionExtra_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

