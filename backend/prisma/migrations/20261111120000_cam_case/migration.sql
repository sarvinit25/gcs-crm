-- CreateTable
CREATE TABLE "CamCase" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "tokenHash" TEXT,
    "tokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenRevokedAt" TIMESTAMP(3),
    "linkSentById" TEXT,
    "linkCreatedAt" TIMESTAMP(3),
    "customerOpenedAt" TIMESTAMP(3),
    "customerSavedAt" TIMESTAMP(3),
    "customerSubmittedAt" TIMESTAMP(3),
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CamCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CamCase_leadId_key" ON "CamCase"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "CamCase_tokenHash_key" ON "CamCase"("tokenHash");

-- AddForeignKey
ALTER TABLE "CamCase" ADD CONSTRAINT "CamCase_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
