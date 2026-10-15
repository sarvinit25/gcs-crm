-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "chatVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChatOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatOtp_phone_createdAt_idx" ON "ChatOtp"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "ChatOtp_expiresAt_idx" ON "ChatOtp"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSession_tokenHash_key" ON "ChatSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ChatSession_phone_idx" ON "ChatSession"("phone");

-- CreateIndex
CREATE INDEX "ChatSession_expiresAt_idx" ON "ChatSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Lead_chatVerifiedAt_idx" ON "Lead"("chatVerifiedAt");
