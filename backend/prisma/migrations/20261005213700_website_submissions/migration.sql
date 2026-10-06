-- CreateEnum
CREATE TYPE "SubmissionOutcome" AS ENUM ('NEW_LEAD', 'DUPLICATE_KEPT', 'DUPLICATE_UPDATED');

-- CreateTable
CREATE TABLE "WebsiteSubmission" (
    "id" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "form" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "loanType" TEXT,
    "amount" DECIMAL(14,2),
    "detail" TEXT,
    "landingPage" TEXT,
    "entries" INTEGER NOT NULL,
    "outcome" "SubmissionOutcome" NOT NULL,
    "sharedPhone" BOOLEAN NOT NULL DEFAULT false,
    "leadId" TEXT,

    CONSTRAINT "WebsiteSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteSubmission_receivedAt_idx" ON "WebsiteSubmission"("receivedAt");

-- CreateIndex
CREATE INDEX "WebsiteSubmission_form_receivedAt_idx" ON "WebsiteSubmission"("form", "receivedAt");

-- CreateIndex
CREATE INDEX "WebsiteSubmission_outcome_receivedAt_idx" ON "WebsiteSubmission"("outcome", "receivedAt");

-- CreateIndex
CREATE INDEX "WebsiteSubmission_phone_idx" ON "WebsiteSubmission"("phone");

-- CreateIndex
CREATE INDEX "WebsiteSubmission_leadId_idx" ON "WebsiteSubmission"("leadId");

-- AddForeignKey
ALTER TABLE "WebsiteSubmission" ADD CONSTRAINT "WebsiteSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
