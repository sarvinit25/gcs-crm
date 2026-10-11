-- CreateEnum
CREATE TYPE "LeadSegment" AS ENUM ('HOT', 'WARM', 'FOLLOW_UP', 'COLD');

-- CreateEnum
CREATE TYPE "DocumentsStatus" AS ENUM ('NONE', 'PARTIAL', 'COMPLETE');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "documentsStatus" "DocumentsStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "segment" "LeadSegment",
ADD COLUMN     "segmentLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "segmentNote" TEXT;

-- CreateIndex
CREATE INDEX "Lead_segment_nextFollowUpAt_idx" ON "Lead"("segment", "nextFollowUpAt");
