-- CreateEnum
CREATE TYPE "CreditDecision" AS ENUM ('READY', 'REJECTED');

-- CreateTable
CREATE TABLE "ExistingLoan" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "applicantId" TEXT,
    "lenderName" TEXT NOT NULL,
    "loanType" TEXT,
    "outstanding" DECIMAL(14,2),
    "emi" DECIMAL(14,2) NOT NULL,
    "monthsLeft" INTEGER,
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExistingLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditEvaluation" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "loanAmount" DECIMAL(14,2),
    "proposedRate" DECIMAL(5,2),
    "tenureMonths" INTEGER,
    "monthlyIncome" DECIMAL(14,2),
    "annualTurnover" DECIMAL(14,2),
    "netProfit" DECIMAL(14,2),
    "depreciation" DECIMAL(14,2),
    "interestPaid" DECIMAL(14,2),
    "avgMonthlyBankCredits" DECIMAL(14,2),
    "gstAnnualTurnover" DECIMAL(14,2),
    "propertyValue" DECIMAL(14,2),
    "remarks" TEXT,
    "decision" "CreditDecision",
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExistingLoan_applicationId_idx" ON "ExistingLoan"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditEvaluation_applicationId_key" ON "CreditEvaluation"("applicationId");

-- AddForeignKey
ALTER TABLE "ExistingLoan" ADD CONSTRAINT "ExistingLoan_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEvaluation" ADD CONSTRAINT "CreditEvaluation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

