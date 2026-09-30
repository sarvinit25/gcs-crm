-- CreateEnum
CREATE TYPE "ApplicantConstitution" AS ENUM ('PROPRIETORSHIP', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'LLP', 'OTHER');

-- CreateEnum
CREATE TYPE "ChecklistApplicantType" AS ENUM ('SALARIED', 'PROFESSIONAL', 'PROPRIETORSHIP', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'LLP', 'NRI');

-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "constitution" "ApplicantConstitution",
ADD COLUMN     "isNRI" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "loanProductId" TEXT,
    "applicantType" "ChecklistApplicantType",
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItem_loanProductId_applicantType_idx" ON "ChecklistItem"("loanProductId", "applicantType");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_loanProductId_fkey" FOREIGN KEY ("loanProductId") REFERENCES "LoanProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
