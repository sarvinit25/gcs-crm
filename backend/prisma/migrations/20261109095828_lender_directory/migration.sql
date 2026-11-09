-- CreateEnum
CREATE TYPE "LenderContactKind" AS ENUM ('RELATIONSHIP', 'DIRECTORY');

-- AlterTable
ALTER TABLE "LenderContact" ADD COLUMN     "altPhone" TEXT,
ADD COLUMN     "branch" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "coverage" TEXT,
ADD COLUMN     "details" JSONB,
ADD COLUMN     "employeeCode" TEXT,
ADD COLUMN     "escalation" JSONB,
ADD COLUMN     "kind" "LenderContactKind" NOT NULL DEFAULT 'RELATIONSHIP',
ADD COLUMN     "region" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "LenderCode" (
    "id" TEXT NOT NULL,
    "lenderId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "loanProductId" TEXT,
    "code" TEXT,
    "registeredName" TEXT,
    "payoutText" TEXT,
    "payoutPercent" DECIMAL(6,3),
    "contactText" TEXT,
    "contactPhone" TEXT,
    "specialCondition" TEXT,
    "source" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LenderCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LenderBranch" (
    "id" TEXT NOT NULL,
    "lenderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "region" TEXT,
    "zone" TEXT,
    "area" TEXT,
    "dsaSourcing" TEXT,
    "details" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LenderBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LenderCode_lenderId_idx" ON "LenderCode"("lenderId");

-- CreateIndex
CREATE INDEX "LenderBranch_lenderId_name_idx" ON "LenderBranch"("lenderId", "name");

-- CreateIndex
CREATE INDEX "LenderContact_lenderId_kind_idx" ON "LenderContact"("lenderId", "kind");

-- CreateIndex
CREATE INDEX "LenderContact_state_idx" ON "LenderContact"("state");

-- CreateIndex
CREATE INDEX "LenderContact_city_idx" ON "LenderContact"("city");

-- AddForeignKey
ALTER TABLE "LenderCode" ADD CONSTRAINT "LenderCode_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "Lender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LenderCode" ADD CONSTRAINT "LenderCode_loanProductId_fkey" FOREIGN KEY ("loanProductId") REFERENCES "LoanProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LenderBranch" ADD CONSTRAINT "LenderBranch_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "Lender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
