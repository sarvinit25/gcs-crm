-- CreateEnum
CREATE TYPE "CreditCheckKind" AS ENUM ('LIVE', 'MANUAL', 'SIMULATED');

-- CreateEnum
CREATE TYPE "CreditCheckStatus" AS ENUM ('SUCCESS', 'FAILED');

-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN "cibilScoreDate" DATE;

-- CreateTable
CREATE TABLE "CreditCheck" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "bureau" TEXT NOT NULL DEFAULT 'CIBIL',
    "kind" "CreditCheckKind" NOT NULL,
    "status" "CreditCheckStatus" NOT NULL,
    "score" INTEGER,
    "reportDate" DATE,
    "reference" TEXT,
    "note" TEXT,
    "error" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentMethod" TEXT,
    "consentText" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditCheck_applicantId_createdAt_idx" ON "CreditCheck"("applicantId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditCheck_createdAt_idx" ON "CreditCheck"("createdAt");

-- AddForeignKey
ALTER TABLE "CreditCheck" ADD CONSTRAINT "CreditCheck_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCheck" ADD CONSTRAINT "CreditCheck_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
