-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columns" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportTemplate_userId_type_idx" ON "ReportTemplate"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplate_userId_type_name_key" ON "ReportTemplate"("userId", "type", "name");

-- CreateIndex
CREATE INDEX "Sanction_sanctionDate_idx" ON "Sanction"("sanctionDate");

-- CreateIndex
CREATE INDEX "Sanction_createdAt_idx" ON "Sanction"("createdAt");

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

