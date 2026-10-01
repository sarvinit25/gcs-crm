-- AlterTable
ALTER TABLE "User" ADD COLUMN "totpLastStep" INTEGER,
ADD COLUMN "totpChallengeJti" TEXT,
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SourcingPartner" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "portalTokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LoginLock" (
    "subject" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginLock_pkey" PRIMARY KEY ("subject")
);
