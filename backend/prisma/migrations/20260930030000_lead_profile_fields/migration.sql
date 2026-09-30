-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "meetingMode" TEXT,
ADD COLUMN     "meetingPlace" TEXT,
ADD COLUMN     "monthlyIncome" DECIMAL(14,2);
