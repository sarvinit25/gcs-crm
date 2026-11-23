-- AlterTable
ALTER TABLE "LenderPolicy" ADD COLUMN "criteria" JSONB;

-- CreateTable
CREATE TABLE "MatchField" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT[],
    "unit" TEXT,
    "hint" TEXT,
    "answerLabel" TEXT,
    "products" TEXT[],
    "applicants" TEXT[],
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchField_key_key" ON "MatchField"("key");
