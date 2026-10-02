-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "inviteId" TEXT;

-- CreateTable
CREATE TABLE "ApplicationInvite" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "draft" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationInvite_tokenHash_key" ON "ApplicationInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "ApplicationInvite_applicationId_createdAt_idx" ON "ApplicationInvite"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_inviteId_idx" ON "Document"("inviteId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "ApplicationInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationInvite" ADD CONSTRAINT "ApplicationInvite_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationInvite" ADD CONSTRAINT "ApplicationInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
