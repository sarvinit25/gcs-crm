-- CreateTable
CREATE TABLE "LenderPolicy" (
    "id" TEXT NOT NULL,
    "lenderId" TEXT NOT NULL,
    "loanProductId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedByName" TEXT,
    "reviewEveryDays" INTEGER NOT NULL DEFAULT 90,
    "minAmount" DECIMAL(14,2),
    "maxAmount" DECIMAL(14,2),
    "minRate" DECIMAL(5,2),
    "maxRate" DECIMAL(5,2),
    "processingFee" TEXT,
    "maxTenureMonths" INTEGER,
    "specialScheme" TEXT,
    "employmentTypes" TEXT[],
    "minAge" INTEGER,
    "maxAgeAtApplication" INTEGER,
    "maxAgeAtMaturity" INTEGER,
    "minMonthlyIncome" DECIMAL(14,2),
    "minBusinessVintageMonths" INTEGER,
    "minAnnualTurnover" DECIMAL(14,2),
    "minAnnualProfit" DECIMAL(14,2),
    "minCreditScore" INTEGER,
    "acceptedConstitutions" TEXT[],
    "gstRequired" BOOLEAN NOT NULL DEFAULT false,
    "foirBands" JSONB,
    "ltvBands" JSONB,
    "acceptedPropertyTypes" TEXT[],
    "allIndia" BOOLEAN NOT NULL DEFAULT false,
    "cities" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LenderPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LenderPolicyChange" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedById" TEXT,
    "changedByName" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LenderPolicyChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyException" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "normalRule" TEXT,
    "possibleException" TEXT,
    "requiredApproval" TEXT,
    "source" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "expertNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRun" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "profile" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseOutcome" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "applicationId" TEXT,
    "lenderId" TEXT,
    "loanProductId" TEXT,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "sanctionAmount" DECIMAL(14,2),
    "rate" DECIMAL(5,2),
    "turnaroundDays" INTEGER,
    "rejectionReason" TEXT,
    "disbursed" BOOLEAN NOT NULL DEFAULT false,
    "profile" JSONB,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LenderPolicy_active_lastVerifiedAt_idx" ON "LenderPolicy"("active", "lastVerifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LenderPolicy_lenderId_loanProductId_key" ON "LenderPolicy"("lenderId", "loanProductId");

-- CreateIndex
CREATE INDEX "LenderPolicyChange_policyId_version_idx" ON "LenderPolicyChange"("policyId", "version");

-- CreateIndex
CREATE INDEX "PolicyException_policyId_idx" ON "PolicyException"("policyId");

-- CreateIndex
CREATE INDEX "MatchRun_leadId_createdAt_idx" ON "MatchRun"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseOutcome_lenderId_loanProductId_idx" ON "CaseOutcome"("lenderId", "loanProductId");

-- CreateIndex
CREATE INDEX "CaseOutcome_leadId_idx" ON "CaseOutcome"("leadId");

-- AddForeignKey
ALTER TABLE "LenderPolicy" ADD CONSTRAINT "LenderPolicy_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "Lender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LenderPolicy" ADD CONSTRAINT "LenderPolicy_loanProductId_fkey" FOREIGN KEY ("loanProductId") REFERENCES "LoanProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LenderPolicyChange" ADD CONSTRAINT "LenderPolicyChange_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LenderPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyException" ADD CONSTRAINT "PolicyException_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LenderPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
