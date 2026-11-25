-- CreateTable
CREATE TABLE "ApplicationChecklistMark" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "given" BOOLEAN NOT NULL,
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationChecklistMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationChecklistMark_applicationId_idx" ON "ApplicationChecklistMark"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationChecklistMark_applicationId_documentTypeId_key" ON "ApplicationChecklistMark"("applicationId", "documentTypeId");

-- AddForeignKey
ALTER TABLE "ApplicationChecklistMark" ADD CONSTRAINT "ApplicationChecklistMark_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationChecklistMark" ADD CONSTRAINT "ApplicationChecklistMark_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
