-- The report file kept with a recorded score. It is an ordinary application document.
ALTER TABLE "CreditCheck" ADD COLUMN "documentId" TEXT;
ALTER TABLE "CreditCheck" ADD CONSTRAINT "CreditCheck_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
