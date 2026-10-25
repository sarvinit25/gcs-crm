-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "address" TEXT,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "employerName" TEXT,
ADD COLUMN     "experienceYears" DECIMAL(4,1),
ADD COLUMN     "officialEmail" TEXT,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "secondaryPhone" TEXT,
ADD COLUMN     "workLocation" TEXT;

