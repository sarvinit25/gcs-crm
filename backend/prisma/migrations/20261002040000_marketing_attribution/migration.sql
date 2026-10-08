-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "channel" TEXT,
ADD COLUMN "campaign" TEXT,
ADD COLUMN "utmSource" TEXT,
ADD COLUMN "utmMedium" TEXT,
ADD COLUMN "utmContent" TEXT,
ADD COLUMN "utmTerm" TEXT,
ADD COLUMN "landingPage" TEXT;

-- CreateTable
CREATE TABLE "MarketingSpend" (
    "id" TEXT NOT NULL,
    "spentOn" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "campaign" TEXT,
    "vendor" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingSpend_spentOn_idx" ON "MarketingSpend"("spentOn");

-- CreateIndex
CREATE INDEX "MarketingSpend_channel_spentOn_idx" ON "MarketingSpend"("channel", "spentOn");

-- CreateIndex
CREATE INDEX "Lead_channel_createdAt_idx" ON "Lead"("channel", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketingSpend" ADD CONSTRAINT "MarketingSpend_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
