-- What was found on a customer's document, by our statement reader or the AI.
CREATE TABLE "DocumentReading" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "summary" TEXT,
    "fields" JSONB NOT NULL,
    "cam" JSONB,
    "model" TEXT,
    "appliedToCamAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentReading_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentReading_documentId_key" ON "DocumentReading"("documentId");

ALTER TABLE "DocumentReading" ADD CONSTRAINT "DocumentReading_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
