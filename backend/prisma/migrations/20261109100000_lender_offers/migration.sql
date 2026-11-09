-- Lender flyers and pasted messages that have been read into draft terms, waiting for a person to review them.
CREATE TABLE "LenderOffer" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT,
    "objectKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "rawText" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "summary" TEXT,
    "extracted" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "appliedLenderId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LenderOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LenderOffer_objectKey_key" ON "LenderOffer"("objectKey");
CREATE INDEX "LenderOffer_status_createdAt_idx" ON "LenderOffer"("status", "createdAt");
