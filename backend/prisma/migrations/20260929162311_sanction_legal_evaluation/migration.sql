-- AlterTable
ALTER TABLE "Sanction" ADD COLUMN     "legalAt" TIMESTAMP(3),
ADD COLUMN     "legalNote" TEXT,
ADD COLUMN     "legalStatus" "SanctionStatus" NOT NULL DEFAULT 'PENDING';
