-- CreateTable
CREATE TABLE "ChatStrike" (
    "phone" TEXT NOT NULL,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "lastStrikeAt" TIMESTAMP(3),
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatStrike_pkey" PRIMARY KEY ("phone")
);
