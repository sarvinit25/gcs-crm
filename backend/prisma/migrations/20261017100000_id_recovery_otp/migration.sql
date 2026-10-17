-- CreateTable
CREATE TABLE "IdRecoveryOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdRecoveryOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdRecoveryOtp_phone_createdAt_idx" ON "IdRecoveryOtp"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "IdRecoveryOtp_expiresAt_idx" ON "IdRecoveryOtp"("expiresAt");
