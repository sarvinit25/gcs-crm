-- CreateTable
CREATE TABLE "EducationLoanDetail" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EducationLoanDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EducationLoanDetail_applicationId_key" ON "EducationLoanDetail"("applicationId");

-- AddForeignKey
ALTER TABLE "EducationLoanDetail" ADD CONSTRAINT "EducationLoanDetail_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
