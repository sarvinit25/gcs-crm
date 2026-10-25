-- AlterTable
ALTER TABLE "Lender" ADD COLUMN     "branchAddress" TEXT,
ADD COLUMN     "branchCity" TEXT,
ADD COLUMN     "branchName" TEXT,
ADD COLUMN     "brokerCode" TEXT,
ADD COLUMN     "defaultCommission" DECIMAL(5,2),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "portalUrl" TEXT,
ADD COLUMN     "shortName" TEXT;

-- AlterTable
ALTER TABLE "LenderPolicy" ADD COLUMN     "commissionPercent" DECIMAL(5,2),
ADD COLUMN     "minTenureMonths" INTEGER,
ADD COLUMN     "rateType" TEXT;

