-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('STAFF', 'PARTNER', 'CLIENT');

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorType" "AuditActorType" NOT NULL DEFAULT 'STAFF';

-- AlterTable
ALTER TABLE "SourcingPartner" ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "CommissionRateCard" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minRate" DECIMAL(5,2) NOT NULL,
    "maxRate" DECIMAL(5,2) NOT NULL,
    "avgAmountLabel" TEXT NOT NULL,
    "earningLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRateCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourcingPartner_phone_key" ON "SourcingPartner"("phone");

